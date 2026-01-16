import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentGovernanceService } from '../AgentGovernanceService.js';
import { AgentPolicy } from '../../../domain/value-objects/AgentPolicy.js';
import { MockLlmService } from '../../../infrastructure/ai/MockLlmService.js';

describe('AgentGovernanceService', () => {
    let service: AgentGovernanceService;
    let mockLlm: MockLlmService;

    beforeEach(() => {
        mockLlm = new MockLlmService();
        service = new AgentGovernanceService(mockLlm);
    });

    describe('Policy Management', () => {
        it('should register and retrieve policies', () => {
            const policy = AgentPolicy.create({
                agentName: 'TestAgent',
                maxSuggestionsPerEvent: 5,
                confidenceThreshold: 0.8,
            });

            service.registerPolicy(policy);
            const retrieved = service.getPolicy('TestAgent');

            expect(retrieved.agentName).toBe('TestAgent');
            expect(retrieved.maxSuggestionsPerEvent).toBe(5);
            expect(retrieved.confidenceThreshold).toBe(0.8);
        });

        it('should return default policy for unregistered agent', () => {
            const policy = service.getPolicy('UnknownAgent');

            expect(policy.agentName).toBe('UnknownAgent');
            expect(policy.maxSuggestionsPerEvent).toBe(3); // default
        });
    });

    describe('Cooldown Enforcement', () => {
        it('should allow first action', () => {
            expect(service.canTakeAction('TestAgent', 'aggregate-1')).toBe(true);
        });

        it('should block action within cooldown period', () => {
            const policy = AgentPolicy.create({
                agentName: 'TestAgent',
                cooldownMs: 60000, // 1 minute
            });
            service.registerPolicy(policy);

            service.recordAction('TestAgent', 'aggregate-1');

            expect(service.canTakeAction('TestAgent', 'aggregate-1')).toBe(false);
        });

        it('should allow action after cooldown expires', async () => {
            const policy = AgentPolicy.create({
                agentName: 'TestAgent',
                cooldownMs: 10, // 10ms for fast test
            });
            service.registerPolicy(policy);

            service.recordAction('TestAgent', 'aggregate-1');

            // Wait for cooldown
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(service.canTakeAction('TestAgent', 'aggregate-1')).toBe(true);
        });

        it('should track cooldowns per aggregate', () => {
            service.recordAction('TestAgent', 'aggregate-1');

            expect(service.canTakeAction('TestAgent', 'aggregate-1')).toBe(false);
            expect(service.canTakeAction('TestAgent', 'aggregate-2')).toBe(true);
        });
    });

    describe('Suggestion Rate Limiting', () => {
        it('should allow suggestions up to limit', () => {
            const policy = AgentPolicy.create({
                agentName: 'TestAgent',
                maxSuggestionsPerEvent: 2,
            });
            service.registerPolicy(policy);

            expect(service.canMakeSuggestion('TestAgent', 'event-1')).toBe(true);
            service.recordSuggestion('TestAgent', 'event-1');

            expect(service.canMakeSuggestion('TestAgent', 'event-1')).toBe(true);
            service.recordSuggestion('TestAgent', 'event-1');

            expect(service.canMakeSuggestion('TestAgent', 'event-1')).toBe(false);
        });

        it('should track suggestions per event', () => {
            const policy = AgentPolicy.create({
                agentName: 'TestAgent',
                maxSuggestionsPerEvent: 1,
            });
            service.registerPolicy(policy);

            service.recordSuggestion('TestAgent', 'event-1');

            expect(service.canMakeSuggestion('TestAgent', 'event-1')).toBe(false);
            expect(service.canMakeSuggestion('TestAgent', 'event-2')).toBe(true);
        });
    });

    describe('Governed Generation', () => {
        it('should generate using LLM when AI enabled', async () => {
            const policy = AgentPolicy.create({
                agentName: 'TestAgent',
                aiEnabled: true,
                confidenceThreshold: 0.5,
            });
            service.registerPolicy(policy);

            const response = await service.generateSimple(
                'TestAgent',
                'Goal Completed: Test Goal',
                () => 'Fallback response'
            );

            expect(response.reasoningSource).toBe('llm');
            expect(response.governance.aiUsed).toBe(true);
            expect(response.governance.fallbackTriggered).toBe(false);
        });

        it('should use fallback when AI disabled', async () => {
            const policy = AgentPolicy.create({
                agentName: 'TestAgent',
                aiEnabled: false,
            });
            service.registerPolicy(policy);

            const response = await service.generateSimple(
                'TestAgent',
                'Any prompt',
                () => 'Fallback response'
            );

            expect(response.content).toBe('Fallback response');
            expect(response.reasoningSource).toBe('fallback');
            expect(response.governance.aiUsed).toBe(false);
            expect(response.governance.fallbackTriggered).toBe(true);
            expect(response.governance.fallbackReason).toBe('AI disabled by policy');
        });

        it('should include governance metadata', async () => {
            const response = await service.generateSimple(
                'TestAgent',
                'Goal Completed: Test',
                () => 'Fallback'
            );

            expect(response.governance).toBeDefined();
            expect(response.governance.policyName).toBe('TestAgent');
            expect(response.governance.latencyMs).toBeGreaterThanOrEqual(0);
            expect(response.governance.model).toBeDefined();
        });
    });

    describe('Template-based Generation', () => {
        it('should build prompt from template and generate', async () => {
            const response = await service.generateWithGovernance(
                'TestAgent',
                'coach_goal_completed',
                {
                    goalTitle: 'Learn TypeScript',
                    difficulty: 'Medium',
                    facet: 'Career',
                },
                () => 'Fallback suggestion'
            );

            expect(response.content).toBeDefined();
            expect(response.governance).toBeDefined();
        });

        it('should fallback if template missing required fields', async () => {
            // With fallbackToRules enabled (default), validation errors trigger fallback
            const response = await service.generateWithGovernance(
                'TestAgent',
                'coach_goal_completed',
                { goalTitle: 'Test' }, // missing difficulty and facet
                () => 'Fallback'
            );

            expect(response.content).toBe('Fallback');
            expect(response.reasoningSource).toBe('fallback');
            expect(response.governance.fallbackTriggered).toBe(true);
            expect(response.governance.fallbackReason).toContain('Missing required fields');
        });

        it('should throw if template invalid and fallback disabled', async () => {
            const policy = AgentPolicy.create({
                agentName: 'StrictAgent',
                aiEnabled: true,
                fallbackToRules: false,
            });
            service.registerPolicy(policy);

            await expect(
                service.generateWithGovernance(
                    'StrictAgent',
                    'coach_goal_completed',
                    { goalTitle: 'Test' }, // missing required fields
                    () => 'Fallback'
                )
            ).rejects.toThrow('Missing required fields');
        });
    });
});

describe('AgentPolicy', () => {
    it('should create with defaults', () => {
        const policy = AgentPolicy.create({ agentName: 'Test' });

        expect(policy.maxSuggestionsPerEvent).toBe(3);
        expect(policy.confidenceThreshold).toBe(0.7);
        expect(policy.cooldownMs).toBe(60000);
        expect(policy.aiEnabled).toBe(true);
        expect(policy.fallbackToRules).toBe(true);
    });

    it('should create conservative policy', () => {
        const policy = AgentPolicy.conservative('Test');

        expect(policy.maxSuggestionsPerEvent).toBe(1);
        expect(policy.confidenceThreshold).toBe(0.9);
        expect(policy.aiEnabled).toBe(false);
    });

    it('should create permissive policy', () => {
        const policy = AgentPolicy.permissive('Test');

        expect(policy.maxSuggestionsPerEvent).toBe(5);
        expect(policy.confidenceThreshold).toBe(0.5);
        expect(policy.aiEnabled).toBe(true);
    });

    it('should check confidence threshold', () => {
        const policy = AgentPolicy.create({
            agentName: 'Test',
            confidenceThreshold: 0.8,
        });

        expect(policy.isConfidenceSufficient(0.9)).toBe(true);
        expect(policy.isConfidenceSufficient(0.8)).toBe(true);
        expect(policy.isConfidenceSufficient(0.7)).toBe(false);
    });
});
