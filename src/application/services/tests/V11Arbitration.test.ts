/**
 * V11Arbitration.test.ts - Mandatory test cases for V11 Arbitration.
 *
 * Tests the complete arbitration flow including:
 * - Proposal submission
 * - Conflict detection
 * - Policy-based resolution
 * - Event emission
 * - Audit trail
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

// Services
import { AgentProposalService, CreateProposalInput } from '../AgentProposalService.js';
import { ConflictDetectionService } from '../ConflictDetectionService.js';
import { AgentArbitrationService } from '../AgentArbitrationService.js';

// Repositories
import { InMemoryAgentProposalRepository } from '../../../infrastructure/persistence/in-memory/InMemoryAgentProposalRepository.js';
import { InMemoryConflictRepository } from '../../../infrastructure/persistence/in-memory/InMemoryConflictRepository.js';
import { InMemoryArbitrationPolicyRepository } from '../../../infrastructure/persistence/in-memory/InMemoryArbitrationPolicyRepository.js';
import { InMemoryArbitrationDecisionRepository } from '../../../infrastructure/persistence/in-memory/InMemoryArbitrationDecisionRepository.js';

// Domain entities
import { ArbitrationPolicyBuilder, IArbitrationPolicy } from '../../../domain/entities/ArbitrationPolicy.js';
import { IConflict, ConflictBuilder } from '../../../domain/entities/ArbitrationDecision.js';

// Events
import { ArbitrationResolved } from '../../../domain/events/ArbitrationResolved.js';
import { ActionSuppressed } from '../../../domain/events/ActionSuppressed.js';
import { ArbitrationEscalated } from '../../../domain/events/ArbitrationEscalated.js';

// Mocks
import { IEventDispatcher } from '../../ports/IEventDispatcher.js';
import { IObservabilityContext } from '../../ports/IObservabilityContext.js';
import { IDomainEvent } from '../../../domain/events/IDomainEvent.js';

describe('V11 Arbitration - Mandatory Test Cases', () => {
    let proposalRepository: InMemoryAgentProposalRepository;
    let conflictRepository: InMemoryConflictRepository;
    let policyRepository: InMemoryArbitrationPolicyRepository;
    let decisionRepository: InMemoryArbitrationDecisionRepository;
    let eventDispatcher: IEventDispatcher;
    let observability: IObservabilityContext;
    let dispatchedEvents: IDomainEvent[];

    let proposalService: AgentProposalService;
    let conflictService: ConflictDetectionService;
    let arbitrationService: AgentArbitrationService;

    beforeEach(() => {
        // Reset repositories
        proposalRepository = new InMemoryAgentProposalRepository();
        conflictRepository = new InMemoryConflictRepository();
        policyRepository = new InMemoryArbitrationPolicyRepository();
        decisionRepository = new InMemoryArbitrationDecisionRepository();

        // Track dispatched events
        dispatchedEvents = [];
        eventDispatcher = {
            dispatch: vi.fn(async (event: IDomainEvent) => {
                dispatchedEvents.push(event);
            }),
            subscribe: vi.fn(),
        };

        // Mock observability
        observability = {
            logger: {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                child: vi.fn(() => ({
                    debug: vi.fn(),
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn(),
                    child: vi.fn(),
                })),
            },
            metrics: {
                incrementCounter: vi.fn(),
                setGauge: vi.fn(),
                recordHistogram: vi.fn(),
                startTimer: vi.fn(() => () => 0),
                getMetrics: vi.fn(() => ({ timestamp: new Date(), counters: {}, gauges: {}, histograms: {} })),
                reset: vi.fn(),
            },
            tracer: {
                startSpan: vi.fn((_name: string) => ({
                    context: () => ({}),
                    name: _name,
                    startTime: Date.now(),
                    setAttributes: vi.fn(),
                    addEvent: vi.fn(),
                    setStatus: vi.fn(),
                    end: vi.fn(),
                    isRecording: () => true,
                })),
            },
        } as unknown as IObservabilityContext;

        // Initialize services
        proposalService = new AgentProposalService(
            proposalRepository,
            eventDispatcher,
            observability
        );

        conflictService = new ConflictDetectionService(
            proposalRepository,
            conflictRepository,
            eventDispatcher,
            observability
        );

        arbitrationService = new AgentArbitrationService(
            proposalRepository,
            policyRepository,
            decisionRepository,
            conflictRepository,
            eventDispatcher,
            observability
        );
    });

    /**
     * Test Case 1: Two agents propose different values for same preference → highest priority wins
     */
    it('should select winner based on priority when two agents propose different values for same preference', async () => {
        // Setup: Create policy with priority order
        const policy = ArbitrationPolicyBuilder.create()
            .withId('priority-policy')
            .withName('Priority Policy')
            .withScope('global')
            .withStrategy('priority')
            .withPriorityOrder(['CoachAgent', 'PlannerAgent', 'LoggerAgent'])
            .withDefault(true)
            .build();
        await policyRepository.save(policy);

        // Act: CoachAgent and PlannerAgent propose different values
        const eventId = IdGenerator.generate();

        await proposalService.submitProposal({
            agentName: 'CoachAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'communication.tone', key: 'tone' },
            proposedValue: 'encouraging',
            confidenceScore: 0.85,
            originatingEventId: eventId,
        });

        await proposalService.submitProposal({
            agentName: 'PlannerAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'communication.tone', key: 'tone' },
            proposedValue: 'direct',
            confidenceScore: 0.90,
            originatingEventId: eventId,
        });

        // Detect conflicts
        const detectionResult = await conflictService.detectConflicts();
        expect(detectionResult.conflicts.length).toBe(1);

        const conflict = detectionResult.conflicts[0];

        // Resolve conflict
        const result = await arbitrationService.resolveConflict(conflict);

        // Assert: CoachAgent wins because it has higher priority (index 0 vs index 1)
        expect(result.winningProposal).not.toBeNull();
        expect(result.winningProposal!.agentName).toBe('CoachAgent');
        expect(result.winningProposal!.proposedValue).toBe('encouraging');
        expect(result.suppressedProposals.length).toBe(1);
        expect(result.suppressedProposals[0].agentName).toBe('PlannerAgent');
        expect(result.decision.outcome).toBe('winner_selected');
        expect(result.decision.strategyUsed).toBe('priority');
    });

    /**
     * Test Case 2: Agent with veto policy proposes action → blocked
     */
    it('should block proposal when veto rule matches', async () => {
        // Setup: Create policy with veto rule for high-risk actions
        const policy = ArbitrationPolicyBuilder.create()
            .withId('veto-policy')
            .withName('Veto Policy')
            .withScope('global')
            .withStrategy('priority')
            .withPriorityOrder(['CoachAgent', 'PlannerAgent'])
            .withVetoRule({
                id: 'block-high-risk',
                name: 'Block High Risk',
                conditionType: 'riskLevel',
                conditionValue: 'high',
                escalateOnVeto: false,
            })
            .withDefault(true)
            .build();
        await policyRepository.save(policy);

        // Act: Submit a high-risk proposal
        const eventId = IdGenerator.generate();
        await proposalService.submitProposal({
            agentName: 'CoachAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'risky.setting', key: 'setting' },
            proposedValue: 'dangerous',
            confidenceScore: 0.95,
            riskLevel: 'high',
            originatingEventId: eventId,
        });

        // Get the proposal
        const proposals = await proposalRepository.findPending();
        expect(proposals.length).toBe(1);

        // Resolve as single proposal
        const result = await arbitrationService.resolveSingleProposal(proposals[0]);

        // Assert: Proposal is vetoed
        expect(result.winningProposal).toBeNull();
        expect(result.vetoedProposals.length).toBe(1);
        expect(result.vetoedProposals[0].agentName).toBe('CoachAgent');
        expect(result.decision.outcome).toBe('all_vetoed');
    });

    /**
     * Test Case 3: High-risk action without explicit approval policy → escalated
     */
    it('should escalate high-risk action when policy requires escalation', async () => {
        // Setup: Create policy with escalation for high risk
        const policy = ArbitrationPolicyBuilder.create()
            .withId('escalation-policy')
            .withName('Escalation Policy')
            .withScope('global')
            .withStrategy('priority')
            .withPriorityOrder(['CoachAgent'])
            .withEscalationRule({
                riskThreshold: 'high',
            })
            .withDefault(true)
            .build();
        await policyRepository.save(policy);

        // Act: Submit a high-risk proposal
        const eventId = IdGenerator.generate();
        await proposalService.submitProposal({
            agentName: 'CoachAgent',
            actionType: 'ModifyGoal',
            targetRef: { type: 'goal', id: 'goal-123' },
            proposedValue: { status: 'cancelled' },
            confidenceScore: 0.75,
            riskLevel: 'high',
            originatingEventId: eventId,
        });

        const proposals = await proposalRepository.findPending();
        const result = await arbitrationService.resolveSingleProposal(proposals[0]);

        // Assert: Decision is escalated
        expect(result.decision.outcome).toBe('escalated');
        expect(result.decision.requiresHumanApproval).toBe(true);
        expect(result.requiresHumanApproval).toBe(true);
        expect(result.winningProposal).toBeNull();

        // Check escalation event was emitted
        const escalationEvents = dispatchedEvents.filter(e => e instanceof ArbitrationEscalated);
        expect(escalationEvents.length).toBe(1);
    });

    /**
     * Test Case 4: Single proposal with no conflict → approved and executed
     */
    it('should approve single proposal with no conflict', async () => {
        // Setup: Create default policy
        const policy = ArbitrationPolicyBuilder.createDefault('default-policy');
        await policyRepository.save(policy);

        // Act: Submit a single low-risk proposal
        const eventId = IdGenerator.generate();
        await proposalService.submitProposal({
            agentName: 'LoggerAgent',
            actionType: 'CreateSuggestion',
            targetRef: { type: 'notification', id: 'notif-123' },
            proposedValue: { message: 'Great progress!' },
            confidenceScore: 0.9,
            riskLevel: 'low',
            originatingEventId: eventId,
        });

        const proposals = await proposalRepository.findPending();
        expect(proposals.length).toBe(1);

        const result = await arbitrationService.resolveSingleProposal(proposals[0]);

        // Assert: Proposal is approved
        expect(result.decision.outcome).toBe('no_conflict');
        expect(result.winningProposal).not.toBeNull();
        expect(result.winningProposal!.agentName).toBe('LoggerAgent');
        expect(result.suppressedProposals.length).toBe(0);
        expect(result.vetoedProposals.length).toBe(0);
        expect(result.requiresHumanApproval).toBe(false);

        // Proposal status should be 'approved'
        const updatedProposal = await proposalRepository.findById(proposals[0].id);
        expect(updatedProposal?.status).toBe('approved');
    });

    /**
     * Test Case 5: Winner's proposal executed, loser's marked as suppressed
     */
    it('should mark losing proposals as suppressed when winner is selected', async () => {
        // Setup: Create policy with weighted scoring
        const policy = ArbitrationPolicyBuilder.create()
            .withId('weighted-policy')
            .withName('Weighted Policy')
            .withScope('global')
            .withStrategy('weighted')
            .withWeights({ confidence: 1.0, cost: 0.3, risk: 0.5 })
            .withDefault(true)
            .build();
        await policyRepository.save(policy);

        const eventId = IdGenerator.generate();

        // LoggerAgent: high confidence, low cost, low risk = high score
        await proposalService.submitProposal({
            agentName: 'LoggerAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'logging.depth', key: 'depth' },
            proposedValue: 'detailed',
            confidenceScore: 0.95,
            costEstimate: 0.1,
            riskLevel: 'low',
            originatingEventId: eventId,
        });

        // PlannerAgent: lower confidence, higher cost
        await proposalService.submitProposal({
            agentName: 'PlannerAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'logging.depth', key: 'depth' },
            proposedValue: 'minimal',
            confidenceScore: 0.60,
            costEstimate: 0.5,
            riskLevel: 'low',
            originatingEventId: eventId,
        });

        const detectionResult = await conflictService.detectConflicts();
        const conflict = detectionResult.conflicts[0];
        const result = await arbitrationService.resolveConflict(conflict);

        // Assert: LoggerAgent wins due to higher weighted score
        expect(result.winningProposal!.agentName).toBe('LoggerAgent');
        expect(result.suppressedProposals.length).toBe(1);
        expect(result.suppressedProposals[0].agentName).toBe('PlannerAgent');

        // Check proposal statuses
        const winningProposal = await proposalRepository.findById(result.winningProposal!.id);
        const losingProposal = await proposalRepository.findById(result.suppressedProposals[0].id);

        expect(winningProposal?.status).toBe('approved');
        expect(losingProposal?.status).toBe('suppressed');
    });

    /**
     * Test Case 6: Every decision produces ArbitrationDecision with decisionFactors
     */
    it('should produce ArbitrationDecision with decisionFactors for every resolution', async () => {
        // Setup: Create policy
        const policy = ArbitrationPolicyBuilder.create()
            .withId('factor-policy')
            .withName('Factor Policy')
            .withScope('global')
            .withStrategy('priority')
            .withPriorityOrder(['CoachAgent', 'PlannerAgent', 'LoggerAgent'])
            .withDefault(true)
            .build();
        await policyRepository.save(policy);

        const eventId = IdGenerator.generate();

        await proposalService.submitProposal({
            agentName: 'CoachAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'test.pref', key: 'pref' },
            proposedValue: 'value1',
            confidenceScore: 0.8,
            originatingEventId: eventId,
        });

        await proposalService.submitProposal({
            agentName: 'LoggerAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'test.pref', key: 'pref' },
            proposedValue: 'value2',
            confidenceScore: 0.9,
            originatingEventId: eventId,
        });

        const detectionResult = await conflictService.detectConflicts();
        const result = await arbitrationService.resolveConflict(detectionResult.conflicts[0]);

        // Assert: Decision has factors
        expect(result.decision.decisionFactors).toBeDefined();
        expect(result.decision.decisionFactors.length).toBeGreaterThan(0);

        // Each proposal should have a factor
        const coachFactor = result.decision.decisionFactors.find(f => f.agentName === 'CoachAgent');
        const loggerFactor = result.decision.decisionFactors.find(f => f.agentName === 'LoggerAgent');

        expect(coachFactor).toBeDefined();
        expect(loggerFactor).toBeDefined();
        expect(coachFactor!.factor).toBe('priority');
        expect(coachFactor!.value).toBe(0); // First in priority order
        expect(loggerFactor!.value).toBe(2); // Third in priority order

        // Decision should be stored
        const storedDecision = await decisionRepository.findById(result.decision.id);
        expect(storedDecision).not.toBeNull();
        expect(storedDecision!.decisionFactors.length).toBeGreaterThan(0);
    });

    /**
     * Test Case 7: Suppressed proposals emit ActionSuppressed event with explanation
     */
    it('should emit ActionSuppressed event with explanation for suppressed proposals', async () => {
        // Setup: Create policy
        const policy = ArbitrationPolicyBuilder.create()
            .withId('suppression-policy')
            .withName('Suppression Policy')
            .withScope('global')
            .withStrategy('priority')
            .withPriorityOrder(['CoachAgent', 'PlannerAgent'])
            .withDefault(true)
            .build();
        await policyRepository.save(policy);

        const eventId = IdGenerator.generate();

        await proposalService.submitProposal({
            agentName: 'CoachAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'comm.style', key: 'style' },
            proposedValue: 'formal',
            confidenceScore: 0.85,
            originatingEventId: eventId,
        });

        await proposalService.submitProposal({
            agentName: 'PlannerAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'comm.style', key: 'style' },
            proposedValue: 'casual',
            confidenceScore: 0.90,
            originatingEventId: eventId,
        });

        const detectionResult = await conflictService.detectConflicts();
        await arbitrationService.resolveConflict(detectionResult.conflicts[0]);

        // Assert: ActionSuppressed event was emitted
        const suppressionEvents = dispatchedEvents.filter(
            e => e instanceof ActionSuppressed
        ) as ActionSuppressed[];

        expect(suppressionEvents.length).toBe(1);

        const event = suppressionEvents[0];
        expect(event.agentName).toBe('PlannerAgent');
        expect(event.reason).toBe('lost_priority');
        expect(event.explanation).toContain('PlannerAgent');
        expect(event.explanation).toContain('suppressed');
        expect(event.winningProposalId).not.toBeNull();
        expect(event.strategyUsed).toBe('priority');

        // Priority comparison should be present
        expect(event.priorityComparison).toBeDefined();
        expect(event.priorityComparison!.thisProposalPriority).toBe(1); // PlannerAgent is index 1
        expect(event.priorityComparison!.winningPriority).toBe(0); // CoachAgent is index 0
    });

    // Additional edge case tests

    it('should handle all proposals vetoed scenario', async () => {
        const policy = ArbitrationPolicyBuilder.create()
            .withId('all-veto-policy')
            .withName('All Veto Policy')
            .withScope('global')
            .withStrategy('priority')
            .withPriorityOrder(['CoachAgent', 'PlannerAgent'])
            .withVetoRule({
                id: 'block-all-agents',
                name: 'Block All',
                conditionType: 'agentBlacklist',
                conditionValue: ['CoachAgent', 'PlannerAgent'],
                escalateOnVeto: false,
            })
            .withDefault(true)
            .build();
        await policyRepository.save(policy);

        const eventId = IdGenerator.generate();

        await proposalService.submitProposal({
            agentName: 'CoachAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'test.key', key: 'key' },
            proposedValue: 'value',
            confidenceScore: 0.9,
            originatingEventId: eventId,
        });

        await proposalService.submitProposal({
            agentName: 'PlannerAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'test.key', key: 'key' },
            proposedValue: 'other',
            confidenceScore: 0.8,
            originatingEventId: eventId,
        });

        const detectionResult = await conflictService.detectConflicts();
        const result = await arbitrationService.resolveConflict(detectionResult.conflicts[0]);

        expect(result.decision.outcome).toBe('all_vetoed');
        expect(result.vetoedProposals.length).toBe(2);
        expect(result.winningProposal).toBeNull();
    });

    it('should use consensus strategy correctly', async () => {
        const policy = ArbitrationPolicyBuilder.create()
            .withId('consensus-policy')
            .withName('Consensus Policy')
            .withScope('global')
            .withStrategy('consensus')
            .withDefault(true)
            .build();
        await policyRepository.save(policy);

        const eventId = IdGenerator.generate();

        // Both agents agree on the same value
        await proposalService.submitProposal({
            agentName: 'CoachAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'shared.pref', key: 'pref' },
            proposedValue: 'agreed_value',
            confidenceScore: 0.9,
            originatingEventId: eventId,
        });

        await proposalService.submitProposal({
            agentName: 'PlannerAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'shared.pref', key: 'pref' },
            proposedValue: 'agreed_value',
            confidenceScore: 0.8,
            originatingEventId: eventId,
        });

        const detectionResult = await conflictService.detectConflicts();
        const result = await arbitrationService.resolveConflict(detectionResult.conflicts[0]);

        // Consensus reached - first proposal wins
        expect(result.decision.outcome).toBe('winner_selected');
        expect(result.winningProposal).not.toBeNull();
    });

    it('should escalate when consensus fails', async () => {
        const policy = ArbitrationPolicyBuilder.create()
            .withId('consensus-fail-policy')
            .withName('Consensus Fail Policy')
            .withScope('global')
            .withStrategy('consensus')
            .withDefault(true)
            .build();
        await policyRepository.save(policy);

        const eventId = IdGenerator.generate();

        // Agents disagree
        await proposalService.submitProposal({
            agentName: 'CoachAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'disputed.pref', key: 'pref' },
            proposedValue: 'value_a',
            confidenceScore: 0.9,
            originatingEventId: eventId,
        });

        await proposalService.submitProposal({
            agentName: 'PlannerAgent',
            actionType: 'ApplyPreference',
            targetRef: { type: 'preference', id: 'disputed.pref', key: 'pref' },
            proposedValue: 'value_b',
            confidenceScore: 0.8,
            originatingEventId: eventId,
        });

        const detectionResult = await conflictService.detectConflicts();
        const result = await arbitrationService.resolveConflict(detectionResult.conflicts[0]);

        // No consensus - escalated
        expect(result.decision.outcome).toBe('escalated');
        expect(result.requiresHumanApproval).toBe(true);
    });
});
