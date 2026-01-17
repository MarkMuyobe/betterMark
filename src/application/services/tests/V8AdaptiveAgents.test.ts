/**
 * V8AdaptiveAgents.test.ts - Integration tests for V8 Adaptive Agents.
 *
 * Tests the full flow:
 * 1. Agent makes decision → DecisionRecord created
 * 2. User provides feedback → FeedbackCaptureService records outcome
 * 3. System suggests preference change → ISuggestedPreference created
 * 4. User approves → Preference updated (validated by registry)
 * 5. Change recorded in history → Can rollback if needed
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAgentLearningRepository } from '../../../infrastructure/persistence/in-memory/InMemoryAgentLearningRepository.js';
import { InMemoryDecisionRecordRepository } from '../../../infrastructure/persistence/in-memory/InMemoryDecisionRecordRepository.js';
import { PreferenceRegistry } from '../../../domain/services/PreferenceRegistry.js';
import { PreferenceSuggestionService } from '../PreferenceSuggestionService.js';
import { PreferenceAuditService } from '../PreferenceAuditService.js';
import { AgentGovernanceService, DecisionEventInfo } from '../AgentGovernanceService.js';
import { MockLlmService } from '../../../infrastructure/ai/MockLlmService.js';
import { ISuggestedPreference, IUserPreference, IFeedbackEntry } from '../../../domain/entities/AgentLearningProfile.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

describe('V8 Adaptive Agents Integration', () => {
    let learningRepository: InMemoryAgentLearningRepository;
    let decisionRecordRepository: InMemoryDecisionRecordRepository;
    let preferenceRegistry: PreferenceRegistry;
    let suggestionService: PreferenceSuggestionService;
    let auditService: PreferenceAuditService;
    let governanceService: AgentGovernanceService;

    beforeEach(() => {
        preferenceRegistry = PreferenceRegistry.createDefault();
        learningRepository = new InMemoryAgentLearningRepository(preferenceRegistry);
        decisionRecordRepository = new InMemoryDecisionRecordRepository();

        const mockLlm = new MockLlmService();
        governanceService = new AgentGovernanceService(
            mockLlm,
            undefined,
            undefined,
            decisionRecordRepository
        );

        suggestionService = new PreferenceSuggestionService(
            learningRepository,
            decisionRecordRepository,
            preferenceRegistry,
            { minFeedbackForSuggestion: 5, minSuggestionConfidence: 0.6 }
        );

        auditService = new PreferenceAuditService(
            learningRepository,
            preferenceRegistry
        );
    });

    describe('PreferenceRegistry (Step 4 - Guardrails)', () => {
        it('should validate allowed preference values', () => {
            expect(preferenceRegistry.isValidValue('communication', 'tone', 'encouraging')).toBe(true);
            expect(preferenceRegistry.isValidValue('communication', 'tone', 'neutral')).toBe(true);
            expect(preferenceRegistry.isValidValue('communication', 'tone', 'invalid')).toBe(false);
        });

        it('should provide detailed validation results', () => {
            const valid = preferenceRegistry.validate('communication', 'tone', 'direct');
            expect(valid.valid).toBe(true);

            const invalid = preferenceRegistry.validate('communication', 'tone', 'harsh');
            expect(invalid.valid).toBe(false);
            expect(invalid.reason).toContain('Invalid value');
            expect(invalid.reason).toContain('Allowed values');
        });

        it('should return default values', () => {
            expect(preferenceRegistry.getDefaultValue('communication', 'tone')).toBe('encouraging');
            expect(preferenceRegistry.getDefaultValue('scheduling', 'aggressiveness')).toBe('moderate');
            expect(preferenceRegistry.getDefaultValue('logging', 'summarization_depth')).toBe('standard');
        });

        it('should reject unknown preferences', () => {
            const result = preferenceRegistry.validate('unknown', 'preference', 'value');
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('Unknown preference');
        });

        it('should get agent-specific defaults', () => {
            const coachDefaults = preferenceRegistry.getAgentDefaults('CoachAgent');
            expect(coachDefaults).toEqual({
                communication: { tone: 'encouraging' }
            });

            const plannerDefaults = preferenceRegistry.getAgentDefaults('PlannerAgent');
            expect(plannerDefaults).toEqual({
                scheduling: { aggressiveness: 'moderate' }
            });
        });
    });

    describe('Decision Record Creation (Step 1)', () => {
        it('should create decision record via governance service', async () => {
            const eventInfo: DecisionEventInfo = {
                triggeringEventType: 'GoalCompleted',
                triggeringEventId: 'event-123',
                aggregateType: 'Goal',
                aggregateId: 'goal-456',
                decisionType: 'suggestion',
            };

            const decisionId = await governanceService.createDecisionRecord(
                'CoachAgent',
                'Great work on completing your goal!',
                'rule',
                eventInfo
            );

            expect(decisionId).toBeDefined();

            const record = await decisionRecordRepository.findById(decisionId);
            expect(record).not.toBeNull();
            expect(record?.agentName).toBe('CoachAgent');
            expect(record?.decisionContent).toBe('Great work on completing your goal!');
            expect(record?.triggeringEventType).toBe('GoalCompleted');
            expect(record?.decisionType).toBe('suggestion');
        });
    });

    describe('Preference Suggestions (Step 2)', () => {
        it('should add and retrieve pending suggestions', async () => {
            const suggestion: ISuggestedPreference = {
                suggestionId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                suggestedValue: 'direct',
                currentValue: 'encouraging',
                confidence: 0.8,
                reason: 'User prefers direct communication based on feedback',
                learnedFrom: ['decision-1', 'decision-2'],
                suggestedAt: new Date(),
                status: 'pending',
            };

            await learningRepository.addSuggestedPreference('CoachAgent', suggestion);
            const pending = await learningRepository.getPendingSuggestions('CoachAgent');

            expect(pending).toHaveLength(1);
            expect(pending[0].suggestedValue).toBe('direct');
            expect(pending[0].status).toBe('pending');
        });

        it('should reject invalid suggestion values', async () => {
            const invalidSuggestion: ISuggestedPreference = {
                suggestionId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                suggestedValue: 'aggressive', // Not a valid tone
                currentValue: 'encouraging',
                confidence: 0.8,
                reason: 'Test',
                learnedFrom: [],
                suggestedAt: new Date(),
                status: 'pending',
            };

            await expect(
                learningRepository.addSuggestedPreference('CoachAgent', invalidSuggestion)
            ).rejects.toThrow('Invalid suggested preference value');
        });

        it('should approve suggestion and apply preference', async () => {
            const suggestionId = IdGenerator.generate();
            const suggestion: ISuggestedPreference = {
                suggestionId,
                category: 'communication',
                key: 'tone',
                suggestedValue: 'neutral',
                currentValue: 'encouraging',
                confidence: 0.85,
                reason: 'Analysis suggests neutral tone works better',
                learnedFrom: [],
                suggestedAt: new Date(),
                status: 'pending',
            };

            await learningRepository.addSuggestedPreference('CoachAgent', suggestion);
            await learningRepository.approveSuggestion('CoachAgent', suggestionId);

            // Check suggestion status
            const profile = await learningRepository.findByAgentName('CoachAgent');
            const approved = profile?.suggestedPreferences.find(s => s.suggestionId === suggestionId);
            expect(approved?.status).toBe('approved');

            // Check preference was applied
            const pref = profile?.preferences.find(
                p => p.category === 'communication' && p.key === 'tone'
            );
            expect(pref?.value).toBe('neutral');
        });

        it('should reject suggestion without applying preference', async () => {
            const suggestionId = IdGenerator.generate();
            const suggestion: ISuggestedPreference = {
                suggestionId,
                category: 'communication',
                key: 'tone',
                suggestedValue: 'direct',
                currentValue: 'encouraging',
                confidence: 0.7,
                reason: 'Test rejection',
                learnedFrom: [],
                suggestedAt: new Date(),
                status: 'pending',
            };

            await learningRepository.addSuggestedPreference('CoachAgent', suggestion);
            await learningRepository.rejectSuggestion('CoachAgent', suggestionId);

            const profile = await learningRepository.findByAgentName('CoachAgent');
            const rejected = profile?.suggestedPreferences.find(s => s.suggestionId === suggestionId);
            expect(rejected?.status).toBe('rejected');

            // Preference should not have changed
            const pref = profile?.preferences.find(
                p => p.category === 'communication' && p.key === 'tone'
            );
            expect(pref).toBeUndefined(); // Never set
        });
    });

    describe('Preference Change History (Step 5)', () => {
        it('should record preference changes in history', async () => {
            const preference: IUserPreference = {
                preferenceId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                value: 'direct',
                confidence: 0.9,
                learnedFrom: [],
                lastUpdated: new Date(),
            };

            await learningRepository.setPreference('CoachAgent', preference, 'user', 'User changed preference');

            const history = await learningRepository.getPreferenceHistory('CoachAgent');
            expect(history).toHaveLength(1);
            expect(history[0].category).toBe('communication');
            expect(history[0].key).toBe('tone');
            expect(history[0].previousValue).toBeNull(); // First change
            expect(history[0].newValue).toBe('direct');
            expect(history[0].changedBy).toBe('user');
            expect(history[0].reason).toBe('User changed preference');
        });

        it('should track multiple changes', async () => {
            // First change
            await learningRepository.setPreference('CoachAgent', {
                preferenceId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                value: 'direct',
                confidence: 0.9,
                learnedFrom: [],
                lastUpdated: new Date(),
            }, 'user');

            // Second change
            await learningRepository.setPreference('CoachAgent', {
                preferenceId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                value: 'gentle',
                confidence: 0.85,
                learnedFrom: [],
                lastUpdated: new Date(),
            }, 'learning');

            const history = await learningRepository.getPreferenceHistory('CoachAgent');
            expect(history).toHaveLength(2);
            // Most recent first
            expect(history[0].newValue).toBe('gentle');
            expect(history[0].previousValue).toBe('direct');
            expect(history[1].newValue).toBe('direct');
            expect(history[1].previousValue).toBeNull();
        });
    });

    describe('Audit Service', () => {
        it('should provide audit summary', async () => {
            // Make some changes
            await learningRepository.setPreference('CoachAgent', {
                preferenceId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                value: 'direct',
                confidence: 0.9,
                learnedFrom: [],
                lastUpdated: new Date(),
            }, 'user');

            const summary = await auditService.getAuditSummary('CoachAgent');
            expect(summary.totalChanges).toBe(1);
            expect(summary.changesByCategory['communication']).toBe(1);
            expect(summary.changesBySource['user']).toBe(1);
        });

        it('should compare current values to defaults', async () => {
            // Change a preference
            await learningRepository.setPreference('CoachAgent', {
                preferenceId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                value: 'direct',
                confidence: 0.9,
                learnedFrom: [],
                lastUpdated: new Date(),
            });

            const comparison = await auditService.compareToDefaults('CoachAgent');
            const toneComparison = comparison.find(c => c.key === 'tone');

            expect(toneComparison?.currentValue).toBe('direct');
            expect(toneComparison?.defaultValue).toBe('encouraging');
            expect(toneComparison?.isDifferent).toBe(true);
        });

        it('should reset preference to default', async () => {
            // Change a preference
            await learningRepository.setPreference('CoachAgent', {
                preferenceId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                value: 'direct',
                confidence: 0.9,
                learnedFrom: [],
                lastUpdated: new Date(),
            });

            const result = await auditService.resetPreferenceToDefault('CoachAgent', 'communication', 'tone');

            expect(result?.from).toBe('direct');
            expect(result?.to).toBe('encouraging');

            // Verify the preference was reset
            const profile = await learningRepository.findByAgentName('CoachAgent');
            const pref = profile?.preferences.find(p => p.key === 'tone');
            expect(pref?.value).toBe('encouraging');
        });
    });

    describe('Validation Guardrails', () => {
        it('should reject invalid preference values when setting', async () => {
            const invalidPreference: IUserPreference = {
                preferenceId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                value: 'angry', // Invalid value
                confidence: 0.9,
                learnedFrom: [],
                lastUpdated: new Date(),
            };

            await expect(
                learningRepository.setPreference('CoachAgent', invalidPreference)
            ).rejects.toThrow('Invalid preference value');
        });

        it('should only accept defined preference keys', async () => {
            const unknownPreference: IUserPreference = {
                preferenceId: IdGenerator.generate(),
                category: 'communication',
                key: 'unknown_key',
                value: 'some_value',
                confidence: 0.9,
                learnedFrom: [],
                lastUpdated: new Date(),
            };

            await expect(
                learningRepository.setPreference('CoachAgent', unknownPreference)
            ).rejects.toThrow('Invalid preference value');
        });
    });

    describe('PreferenceSuggestionService', () => {
        it('should create manual suggestions', async () => {
            const suggestionId = await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Manual suggestion for testing'
            );

            const pending = await suggestionService.getPendingSuggestions('CoachAgent');
            expect(pending).toHaveLength(1);
            expect(pending[0].suggestionId).toBe(suggestionId);
        });

        it('should reject invalid manual suggestions', async () => {
            await expect(
                suggestionService.createManualSuggestion(
                    'CoachAgent',
                    'communication',
                    'tone',
                    'invalid_tone',
                    'Should fail'
                )
            ).rejects.toThrow('Invalid preference value');
        });
    });

    describe('Full End-to-End Flow', () => {
        it('should complete the full adaptive agent cycle', async () => {
            // 1. Create a decision record (simulating agent action)
            const eventInfo: DecisionEventInfo = {
                triggeringEventType: 'GoalCompleted',
                triggeringEventId: 'event-1',
                aggregateType: 'Goal',
                aggregateId: 'goal-1',
                decisionType: 'suggestion',
            };

            const decisionId = await governanceService.createDecisionRecord(
                'CoachAgent',
                'Encouraging message for goal completion',
                'rule',
                eventInfo
            );

            // 2. Record feedback (simulating user response)
            const feedbackEntry: IFeedbackEntry = {
                decisionRecordId: decisionId,
                timestamp: new Date(),
                decisionType: 'suggestion',
                userAccepted: false, // User didn't like it
                userFeedback: 'Too enthusiastic',
                context: { tone: 'encouraging' },
            };

            await learningRepository.addFeedback('CoachAgent', feedbackEntry);

            // 3. Create a suggestion (normally done by analysis)
            const suggestionId = await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'User rejected encouraging tone'
            );

            // 4. Approve the suggestion
            await suggestionService.approveSuggestion('CoachAgent', suggestionId);

            // 5. Verify preference was updated
            const profile = await learningRepository.findByAgentName('CoachAgent');
            const tonePref = profile?.preferences.find(p => p.key === 'tone');
            expect(tonePref?.value).toBe('neutral');

            // 6. Verify change is in history
            const history = await auditService.getChangeHistory('CoachAgent');
            expect(history.length).toBeGreaterThan(0);
            expect(history[0].newValue).toBe('neutral');

            // 7. Verify we can rollback if needed
            const comparison = await auditService.compareToDefaults('CoachAgent');
            const toneComparison = comparison.find(c => c.key === 'tone');
            expect(toneComparison?.isDifferent).toBe(true);
        });
    });
});
