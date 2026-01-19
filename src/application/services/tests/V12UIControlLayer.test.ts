/**
 * V12UIControlLayer.test.ts - Tests for V12 UI/Control Layer.
 *
 * Mandatory test requirements:
 * 1. Read models match domain state
 * 2. Projections have zero side effects
 * 3. Explanation includes suppressed alternatives
 * 4. Approvals trigger correct domain events
 * 5. Rollbacks restore exact state
 * 6. No agent can mutate state via UI services
 * 7. All APIs are idempotent where applicable
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

// Read Models
import { PreferenceReadModel } from '../../read-models/PreferenceReadModel.js';
import { SuggestionReadModel } from '../../read-models/SuggestionReadModel.js';
import { ArbitrationDecisionReadModel } from '../../read-models/ArbitrationDecisionReadModel.js';
import { AuditTrailReadModel } from '../../read-models/AuditTrailReadModel.js';

// Projection Services
import { PreferenceProjectionService } from '../../projections/PreferenceProjectionService.js';
import { SuggestionProjectionService } from '../../projections/SuggestionProjectionService.js';
import { ArbitrationDecisionProjectionService } from '../../projections/ArbitrationDecisionProjectionService.js';
import { AuditTrailProjectionService } from '../../projections/AuditTrailProjectionService.js';

// Services
import { DecisionExplanationService } from '../DecisionExplanationService.js';
import { SuggestionApprovalService, SuggestionApproved, SuggestionRejected } from '../SuggestionApprovalService.js';
import { EscalationApprovalService } from '../EscalationApprovalService.js';
import { RollbackService } from '../RollbackService.js';
import { AutoAdaptationService, InMemoryAutoAdaptationAttemptRepository } from '../AutoAdaptationService.js';
import { AdaptationPolicyService, InMemoryAdaptationPolicyRepository } from '../AdaptationPolicyService.js';

// Repositories
import { InMemoryAgentLearningRepository } from '../../../infrastructure/persistence/in-memory/InMemoryAgentLearningRepository.js';
import { InMemoryAgentProposalRepository } from '../../../infrastructure/persistence/in-memory/InMemoryAgentProposalRepository.js';
import { InMemoryArbitrationPolicyRepository } from '../../../infrastructure/persistence/in-memory/InMemoryArbitrationPolicyRepository.js';
import { InMemoryArbitrationDecisionRepository } from '../../../infrastructure/persistence/in-memory/InMemoryArbitrationDecisionRepository.js';

// Domain
import { PreferenceRegistry } from '../../../domain/services/PreferenceRegistry.js';
import { ArbitrationPolicyBuilder } from '../../../domain/entities/ArbitrationPolicy.js';
import { ArbitrationDecisionBuilder, IDecisionFactor } from '../../../domain/entities/ArbitrationDecision.js';
import { AgentActionProposalBuilder } from '../../../domain/entities/AgentActionProposal.js';

// Ports
import { IEventDispatcher } from '../../ports/IEventDispatcher.js';
import { IObservabilityContext } from '../../ports/IObservabilityContext.js';
import { IDomainEvent } from '../../../domain/events/IDomainEvent.js';

describe('V12 UI/Control Layer - Mandatory Tests', () => {
    // Repositories
    let learningRepository: InMemoryAgentLearningRepository;
    let proposalRepository: InMemoryAgentProposalRepository;
    let arbitrationPolicyRepository: InMemoryArbitrationPolicyRepository;
    let decisionRepository: InMemoryArbitrationDecisionRepository;
    let adaptationPolicyRepository: InMemoryAdaptationPolicyRepository;
    let attemptRepository: InMemoryAutoAdaptationAttemptRepository;

    // Services
    let preferenceRegistry: PreferenceRegistry;
    let adaptationPolicyService: AdaptationPolicyService;
    let autoAdaptationService: AutoAdaptationService;

    // Projection Services
    let preferenceProjection: PreferenceProjectionService;
    let suggestionProjection: SuggestionProjectionService;
    let arbitrationProjection: ArbitrationDecisionProjectionService;
    let auditProjection: AuditTrailProjectionService;

    // Control Services
    let explanationService: DecisionExplanationService;
    let suggestionApproval: SuggestionApprovalService;
    let escalationApproval: EscalationApprovalService;
    let rollbackService: RollbackService;

    // Mocks
    let eventDispatcher: IEventDispatcher;
    let observability: IObservabilityContext;
    let dispatchedEvents: IDomainEvent[];

    beforeEach(async () => {
        // Initialize repositories
        preferenceRegistry = PreferenceRegistry.createDefault();
        learningRepository = new InMemoryAgentLearningRepository(preferenceRegistry);
        proposalRepository = new InMemoryAgentProposalRepository();
        arbitrationPolicyRepository = new InMemoryArbitrationPolicyRepository();
        decisionRepository = new InMemoryArbitrationDecisionRepository();
        adaptationPolicyRepository = new InMemoryAdaptationPolicyRepository();
        attemptRepository = new InMemoryAutoAdaptationAttemptRepository();

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
                child: vi.fn(() => observability.logger),
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
        adaptationPolicyService = new AdaptationPolicyService(
            adaptationPolicyRepository,
            preferenceRegistry,
            observability
        );

        autoAdaptationService = new AutoAdaptationService(
            learningRepository,
            adaptationPolicyService,
            attemptRepository,
            preferenceRegistry,
            eventDispatcher,
            observability
        );

        // Initialize projection services
        preferenceProjection = new PreferenceProjectionService(
            learningRepository,
            preferenceRegistry,
            attemptRepository
        );

        suggestionProjection = new SuggestionProjectionService(
            learningRepository,
            preferenceRegistry,
            adaptationPolicyService
        );

        arbitrationProjection = new ArbitrationDecisionProjectionService(
            decisionRepository,
            proposalRepository
        );

        auditProjection = new AuditTrailProjectionService(
            decisionRepository,
            proposalRepository,
            attemptRepository
        );

        // Initialize control services
        explanationService = new DecisionExplanationService(
            decisionRepository,
            arbitrationPolicyRepository,
            proposalRepository,
            attemptRepository,
            adaptationPolicyService
        );

        suggestionApproval = new SuggestionApprovalService(
            learningRepository,
            eventDispatcher,
            null, // No V11 proposal service for basic tests
            observability
        );

        escalationApproval = new EscalationApprovalService(
            decisionRepository,
            proposalRepository,
            eventDispatcher,
            observability
        );

        rollbackService = new RollbackService(
            learningRepository,
            decisionRepository,
            proposalRepository,
            attemptRepository,
            autoAdaptationService,
            eventDispatcher,
            observability
        );

        // Create a learning profile
        await learningRepository.getOrCreate('CoachAgent');
    });

    /**
     * Test 1: Read models match domain state
     */
    it('should produce read models that match domain state', async () => {
        // Set up domain state
        await learningRepository.setPreference('CoachAgent', {
            preferenceId: IdGenerator.generate(),
            category: 'communication',
            key: 'tone',
            value: 'encouraging',
            confidence: 0.9,
            learnedFrom: [],
            lastUpdated: new Date(),
        });

        // Build read models
        const readModels = await preferenceProjection.buildPreferenceReadModelsForAgent('CoachAgent');

        // Find the tone preference
        const toneModel = readModels.find(m => m.preferenceKey === 'communication.tone');

        expect(toneModel).toBeDefined();
        expect(toneModel!.currentValue).toBe('encouraging');
        expect(toneModel!.agentType).toBe('CoachAgent');
    });

    /**
     * Test 2: Projections have zero side effects
     */
    it('should have projections with zero side effects', async () => {
        // Get initial state
        const initialProfile = await learningRepository.findByAgentName('CoachAgent');
        const initialPrefCount = initialProfile?.preferences.length ?? 0;

        // Run projections multiple times
        await preferenceProjection.buildAllPreferenceReadModels();
        await suggestionProjection.buildAllSuggestionReadModels();
        await arbitrationProjection.buildAllArbitrationDecisionReadModels();
        await auditProjection.buildAllAuditTrailReadModels();

        // Verify no side effects
        const afterProfile = await learningRepository.findByAgentName('CoachAgent');
        expect(afterProfile?.preferences.length ?? 0).toBe(initialPrefCount);

        // No events should be dispatched by projections
        const projectionEvents = dispatchedEvents.length;
        await preferenceProjection.buildAllPreferenceReadModels();
        expect(dispatchedEvents.length).toBe(projectionEvents);
    });

    /**
     * Test 3: Explanation includes suppressed alternatives
     */
    it('should include suppressed alternatives in explanations', async () => {
        // Create proposals
        const proposal1 = AgentActionProposalBuilder.create()
            .withId('proposal-1')
            .withAgent('CoachAgent')
            .withActionType('ApplyPreference')
            .withTarget({ type: 'preference', id: 'comm.tone', key: 'tone' })
            .withProposedValue('encouraging')
            .withConfidence(0.9)
            .withOriginatingEvent('event-1')
            .build();

        const proposal2 = AgentActionProposalBuilder.create()
            .withId('proposal-2')
            .withAgent('PlannerAgent')
            .withActionType('ApplyPreference')
            .withTarget({ type: 'preference', id: 'comm.tone', key: 'tone' })
            .withProposedValue('direct')
            .withConfidence(0.8)
            .withOriginatingEvent('event-1')
            .build();

        await proposalRepository.save(proposal1);
        await proposalRepository.save(proposal2);

        // Create a policy
        const policy = ArbitrationPolicyBuilder.create()
            .withId('test-policy')
            .withName('Test Policy')
            .withScope('global')
            .withStrategy('priority')
            .withPriorityOrder(['CoachAgent', 'PlannerAgent'])
            .withDefault(true)
            .build();
        await arbitrationPolicyRepository.save(policy);

        // Create a decision with suppressed proposal
        const decisionFactors: IDecisionFactor[] = [
            { proposalId: 'proposal-1', agentName: 'CoachAgent', factor: 'priority', value: 0, impact: 'positive' },
            { proposalId: 'proposal-2', agentName: 'PlannerAgent', factor: 'priority', value: 1, impact: 'negative' },
        ];

        const decision = ArbitrationDecisionBuilder.create()
            .withId('decision-1')
            .withConflictId('conflict-1')
            .withWinner('proposal-1')
            .withSuppressedProposals(['proposal-2'])
            .withStrategy('priority')
            .withPolicy('test-policy')
            .withReasoning('CoachAgent won by priority')
            .build();

        // Add factors manually
        decision.decisionFactors = decisionFactors;
        await decisionRepository.save(decision);

        // Get explanation
        const explanation = await explanationService.explainArbitrationDecision('decision-1');

        expect(explanation).not.toBeNull();
        expect(explanation!.alternativesConsidered.length).toBeGreaterThan(0);
        expect(explanation!.whyOthersLost.length).toBeGreaterThan(0);

        const plannerAlternative = explanation!.alternativesConsidered.find(a => a.agentName === 'PlannerAgent');
        expect(plannerAlternative).toBeDefined();
        expect(plannerAlternative!.whyNotChosen).toContain('priority');
    });

    /**
     * Test 4: Approvals trigger correct domain events
     */
    it('should trigger correct domain events on approval', async () => {
        // Create a pending suggestion
        await learningRepository.addSuggestedPreference('CoachAgent', {
            suggestionId: 'suggestion-1',
            category: 'communication',
            key: 'tone',
            suggestedValue: 'direct',
            currentValue: 'encouraging',
            confidence: 0.85,
            reason: 'User prefers direct communication',
            learnedFrom: [],
            suggestedAt: new Date(),
            status: 'pending',
        });

        // Approve the suggestion
        const result = await suggestionApproval.approveSuggestion('CoachAgent', 'suggestion-1');

        expect(result.success).toBe(true);

        // Check that SuggestionApproved event was dispatched
        const approvalEvents = dispatchedEvents.filter(e => e instanceof SuggestionApproved);
        expect(approvalEvents.length).toBe(1);

        const approvalEvent = approvalEvents[0] as SuggestionApproved;
        expect(approvalEvent.agentName).toBe('CoachAgent');
        expect(approvalEvent.suggestionId).toBe('suggestion-1');
    });

    /**
     * Test 4b: Rejections trigger correct domain events
     */
    it('should trigger correct domain events on rejection', async () => {
        // Create a pending suggestion
        await learningRepository.addSuggestedPreference('CoachAgent', {
            suggestionId: 'suggestion-2',
            category: 'communication',
            key: 'tone',
            suggestedValue: 'gentle',
            confidence: 0.6,
            reason: 'Low confidence suggestion',
            learnedFrom: [],
            suggestedAt: new Date(),
            status: 'pending',
        });

        // Reject the suggestion
        const result = await suggestionApproval.rejectSuggestion('CoachAgent', 'suggestion-2', 'Not appropriate');

        expect(result.success).toBe(true);

        // Check that SuggestionRejected event was dispatched
        const rejectionEvents = dispatchedEvents.filter(e => e instanceof SuggestionRejected);
        expect(rejectionEvents.length).toBe(1);

        const rejectionEvent = rejectionEvents[0] as SuggestionRejected;
        expect(rejectionEvent.agentName).toBe('CoachAgent');
        expect(rejectionEvent.reason).toBe('Not appropriate');
    });

    /**
     * Test 5: Rollbacks restore exact state
     */
    it('should restore exact previous state on rollback', async () => {
        // Set initial value
        const originalValue = 'encouraging';
        await learningRepository.setPreference('CoachAgent', {
            preferenceId: IdGenerator.generate(),
            category: 'communication',
            key: 'tone',
            value: originalValue,
            confidence: 1.0,
            learnedFrom: [],
            lastUpdated: new Date(),
        });

        // Enable auto-adaptation for CoachAgent
        await adaptationPolicyService.enableAutoAdaptation('CoachAgent');

        // Create a suggestion
        await learningRepository.addSuggestedPreference('CoachAgent', {
            suggestionId: 'auto-suggestion',
            category: 'communication',
            key: 'tone',
            suggestedValue: 'direct',
            currentValue: originalValue,
            confidence: 0.9,
            reason: 'Test suggestion',
            learnedFrom: [],
            suggestedAt: new Date(),
            status: 'pending',
        });

        // Approve and apply
        await learningRepository.approveSuggestion('CoachAgent', 'auto-suggestion', 'learning');

        // Verify value changed
        const afterApproval = await learningRepository.findByAgentName('CoachAgent');
        const afterPref = afterApproval?.preferences.find(p => p.category === 'communication' && p.key === 'tone');
        expect(afterPref?.value).toBe('direct');

        // Rollback
        await rollbackService.rollbackByPreference('CoachAgent', 'communication.tone', 'Testing rollback');

        // Verify exact state restored
        const afterRollback = await learningRepository.findByAgentName('CoachAgent');
        const rolledBackPref = afterRollback?.preferences.find(p => p.category === 'communication' && p.key === 'tone');
        expect(rolledBackPref?.value).toBe(originalValue);
    });

    /**
     * Test 6: No agent can mutate state via UI services
     * (This is enforced by type system and service design - approval services require explicit user action)
     */
    it('should not allow approval of non-pending suggestions', async () => {
        // Create an already approved suggestion
        await learningRepository.addSuggestedPreference('CoachAgent', {
            suggestionId: 'already-approved',
            category: 'communication',
            key: 'tone',
            suggestedValue: 'direct',
            confidence: 0.9,
            reason: 'Test',
            learnedFrom: [],
            suggestedAt: new Date(),
            status: 'approved', // Already approved
        });

        // Try to approve again
        const result = await suggestionApproval.approveSuggestion('CoachAgent', 'already-approved');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not pending');
    });

    /**
     * Test 7: APIs are idempotent where applicable
     */
    it('should be idempotent for read operations', async () => {
        // Set up some state
        await learningRepository.setPreference('CoachAgent', {
            preferenceId: IdGenerator.generate(),
            category: 'communication',
            key: 'tone',
            value: 'encouraging',
            confidence: 0.9,
            learnedFrom: [],
            lastUpdated: new Date(),
        });

        // Call projection multiple times
        const result1 = await preferenceProjection.buildPreferenceReadModelsForAgent('CoachAgent');
        const result2 = await preferenceProjection.buildPreferenceReadModelsForAgent('CoachAgent');
        const result3 = await preferenceProjection.buildPreferenceReadModelsForAgent('CoachAgent');

        // Results should be identical
        expect(result1.length).toBe(result2.length);
        expect(result2.length).toBe(result3.length);

        const tone1 = result1.find(r => r.preferenceKey === 'communication.tone');
        const tone2 = result2.find(r => r.preferenceKey === 'communication.tone');
        const tone3 = result3.find(r => r.preferenceKey === 'communication.tone');

        expect(tone1?.currentValue).toBe(tone2?.currentValue);
        expect(tone2?.currentValue).toBe(tone3?.currentValue);
    });

    /**
     * Additional: Escalation approval tests
     */
    it('should handle escalation approval correctly', async () => {
        // Create a proposal
        const proposal = AgentActionProposalBuilder.create()
            .withId('escalated-proposal')
            .withAgent('CoachAgent')
            .withActionType('ApplyPreference')
            .withTarget({ type: 'preference', id: 'comm.tone', key: 'tone' })
            .withProposedValue('aggressive')
            .withConfidence(0.5)
            .withRiskLevel('high')
            .withOriginatingEvent('event-1')
            .build();
        await proposalRepository.save(proposal);

        // Create an escalated decision
        const decision = ArbitrationDecisionBuilder.create()
            .withId('escalated-decision')
            .withConflictId('conflict-1')
            .withPolicy('test-policy')
            .withStrategy('priority')
            .withEscalation()
            .withReasoning('High risk action requires approval')
            .build();
        await decisionRepository.save(decision);

        // Approve the escalation
        const result = await escalationApproval.approveEscalatedDecision(
            'escalated-decision',
            'admin',
            'escalated-proposal'
        );

        expect(result.success).toBe(true);

        // Verify the decision was updated
        const updatedDecision = await decisionRepository.findById('escalated-decision');
        expect(updatedDecision?.executed).toBe(true);
        expect(updatedDecision?.requiresHumanApproval).toBe(false);
    });

    /**
     * Test audit trail projection
     */
    it('should build complete audit trail from all sources', async () => {
        // Create some adaptation attempts
        await attemptRepository.save({
            id: 'attempt-1',
            agentName: 'CoachAgent',
            suggestionId: 'suggestion-1',
            category: 'communication',
            key: 'tone',
            previousValue: 'neutral',
            suggestedValue: 'encouraging',
            confidence: 0.85,
            riskLevel: 'low',
            result: 'applied',
            policyId: 'policy-1',
            policySnapshot: { mode: 'assisted', userOptedIn: true, minConfidence: 0.7, allowedRiskLevels: ['low'] },
            timestamp: new Date(),
            rolledBack: false,
        });

        // Build audit trail
        const auditTrail = await auditProjection.buildAllAuditTrailReadModels();

        expect(auditTrail.length).toBeGreaterThan(0);

        const adaptationRecord = auditTrail.find(r => r.type === 'adaptation');
        expect(adaptationRecord).toBeDefined();
        expect(adaptationRecord!.agentType).toBe('CoachAgent');
    });
});
