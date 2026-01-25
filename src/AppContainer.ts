import { PrismaGoalRepository } from './infrastructure/persistence/repositories/PrismaGoalRepository.js';
import { PrismaTaskRepository } from './infrastructure/persistence/repositories/PrismaTaskRepository.js';
import { PrismaSubGoalRepository } from './infrastructure/persistence/repositories/PrismaSubGoalRepository.js';
import { PrismaScheduleRepository } from './infrastructure/persistence/repositories/PrismaScheduleRepository.js';
import { InMemoryAgentActionLogRepository } from './infrastructure/persistence/in-memory/InMemoryAgentActionLogRepository.js';
import { InMemoryAgentLearningRepository } from './infrastructure/persistence/in-memory/InMemoryAgentLearningRepository.js';
import { InMemoryDecisionRecordRepository } from './infrastructure/persistence/in-memory/InMemoryDecisionRecordRepository.js';
import { InMemoryEventDispatcher } from './infrastructure/messaging/InMemoryEventDispatcher.js';
import { IAgentLearningRepository } from './application/ports/IAgentLearningRepository.js';
import { IDecisionRecordRepository } from './application/ports/IDecisionRecordRepository.js';
import { CreateGoal } from './application/use-cases/implementation/CreateGoal.js';
import { CreateGoalController } from './interface-adapters/controllers/CreateGoalController.js';
import { CoachAgentHandler } from './application/handlers/CoachAgentHandler.js';
import { LoggerAgentHandler } from './application/handlers/LoggerAgentHandler.js';
import { PlannerAgentHandler } from './application/handlers/PlannerAgentHandler.js';
import { HealthController } from './interface-adapters/controllers/HealthController.js';
import { AgentGovernanceService } from './application/services/AgentGovernanceService.js';
import { AgentCoordinationService } from './application/services/AgentCoordinationService.js';
import { PreferenceSuggestionService } from './application/services/PreferenceSuggestionService.js';
import { PreferenceAuditService } from './application/services/PreferenceAuditService.js';
import { FeedbackCaptureService } from './application/services/FeedbackCaptureService.js';
import { AdaptiveAnalyticsService } from './application/services/AdaptiveAnalyticsService.js';
import { AnalyticsService } from './application/services/AnalyticsService.js';
import { AdaptationPolicyService, InMemoryAdaptationPolicyRepository } from './application/services/AdaptationPolicyService.js';
import { AutoAdaptationService, InMemoryAutoAdaptationAttemptRepository } from './application/services/AutoAdaptationService.js';
import { AgentPolicy } from './domain/value-objects/AgentPolicy.js';
import { PreferenceRegistry } from './domain/services/PreferenceRegistry.js';
import { PromptBuilder } from './application/ai/PromptTemplates.js';
import { ILlmService } from './application/ports/ILlmService.js';
import { LlmServiceFactory } from './infrastructure/ai/LlmServiceFactory.js';
import { IObservabilityContext } from './application/ports/IObservabilityContext.js';
import { ConsoleLogger, ILogger } from './infrastructure/observability/Logger.js';
import { InMemoryMetricsCollector, IMetricsCollector } from './infrastructure/observability/MetricsCollector.js';
import { SimpleTracer, ITracer } from './infrastructure/observability/Tracer.js';
import { PreferenceAutoApplied } from './domain/events/PreferenceAutoApplied.js';
import { PreferenceAutoBlocked } from './domain/events/PreferenceAutoBlocked.js';

// V11 Arbitration imports
import { AgentProposalService } from './application/services/AgentProposalService.js';
import { ConflictDetectionService } from './application/services/ConflictDetectionService.js';
import { AgentArbitrationService } from './application/services/AgentArbitrationService.js';
import { InMemoryAgentProposalRepository } from './infrastructure/persistence/in-memory/InMemoryAgentProposalRepository.js';
import { InMemoryConflictRepository } from './infrastructure/persistence/in-memory/InMemoryConflictRepository.js';
import { InMemoryArbitrationPolicyRepository } from './infrastructure/persistence/in-memory/InMemoryArbitrationPolicyRepository.js';
import { InMemoryArbitrationDecisionRepository } from './infrastructure/persistence/in-memory/InMemoryArbitrationDecisionRepository.js';
import { ArbitrationPolicyBuilder } from './domain/entities/ArbitrationPolicy.js';

// V12 UI/Control Layer imports
import { PreferenceProjectionService } from './application/projections/PreferenceProjectionService.js';
import { SuggestionProjectionService } from './application/projections/SuggestionProjectionService.js';
import { ArbitrationDecisionProjectionService } from './application/projections/ArbitrationDecisionProjectionService.js';
import { AuditTrailProjectionService } from './application/projections/AuditTrailProjectionService.js';
import { DecisionExplanationService } from './application/services/DecisionExplanationService.js';
import { SuggestionApprovalService } from './application/services/SuggestionApprovalService.js';
import { EscalationApprovalService } from './application/services/EscalationApprovalService.js';
import { RollbackService } from './application/services/RollbackService.js';

// V13 Admin Control Plane imports
import { AdminPreferencesController } from './interface-adapters/controllers/admin/AdminPreferencesController.js';
import { AdminSuggestionsController } from './interface-adapters/controllers/admin/AdminSuggestionsController.js';
import { AdminArbitrationsController } from './interface-adapters/controllers/admin/AdminArbitrationsController.js';
import { AdminAuditController } from './interface-adapters/controllers/admin/AdminAuditController.js';
import { AdminExplanationsController } from './interface-adapters/controllers/admin/AdminExplanationsController.js';
import { AdminAuthController } from './interface-adapters/controllers/admin/AdminAuthController.js';
import { AdminRouter } from './interface-adapters/routing/AdminRouter.js';
import { MetricsController } from './interface-adapters/controllers/MetricsController.js';

// V14 Productization imports
import { JwtService } from './infrastructure/auth/JwtService.js';
import { InMemoryTokenStore, ITokenStore } from './infrastructure/auth/TokenStore.js';
import { InMemoryUserStore, IUserStore } from './infrastructure/auth/UserStore.js';
import { JwtAuth } from './interface-adapters/middleware/JwtAuth.js';
import { InMemoryIdempotencyStore, IIdempotencyStore } from './infrastructure/persistence/in-memory/InMemoryIdempotencyStore.js';
import { IdempotencyMiddleware } from './interface-adapters/middleware/IdempotencyMiddleware.js';
import { TimeoutMiddleware } from './interface-adapters/middleware/TimeoutMiddleware.js';
import { CircuitBreaker, CircuitBreakerRegistry } from './infrastructure/resilience/CircuitBreaker.js';
import { LLM_CIRCUIT_BREAKER_CONFIG } from './infrastructure/resilience/CircuitBreakerConfig.js';
import { AdminMetrics } from './infrastructure/observability/AdminMetrics.js';

// V15 Product UI imports
import { SessionAuth, InMemorySessionStore } from './infrastructure/auth/SessionAuth.js';
import { GoalProjectionService } from './application/projections/GoalProjectionService.js';
import { TaskProjectionService } from './application/projections/TaskProjectionService.js';
import { ScheduleProjectionService } from './application/projections/ScheduleProjectionService.js';
import { ActivityProjectionService, IActivityLogRepository, IJournalEntryRepository } from './application/projections/ActivityProjectionService.js';
import { InMemoryActivityLogRepository } from './infrastructure/persistence/in-memory/InMemoryActivityLogRepository.js';
import { InMemoryJournalEntryRepository } from './infrastructure/persistence/in-memory/InMemoryJournalEntryRepository.js';
import { ProductGoalsController } from './interface-adapters/controllers/product/ProductGoalsController.js';
import { ProductSubGoalsController } from './interface-adapters/controllers/product/ProductSubGoalsController.js';
import { ProductTasksController } from './interface-adapters/controllers/product/ProductTasksController.js';
import { ProductScheduleController } from './interface-adapters/controllers/product/ProductScheduleController.js';
import { ProductLogsController } from './interface-adapters/controllers/product/ProductLogsController.js';
import { ProductRouter } from './interface-adapters/routing/ProductRouter.js';
import { CreateSubGoal } from './application/use-cases/implementation/CreateSubGoal.js';
import { CreateTask } from './application/use-cases/implementation/CreateTask.js';
import { CompleteTask } from './application/use-cases/implementation/CompleteTask.js';
import { UpdateGoal } from './application/use-cases/implementation/UpdateGoal.js';

// TODO: Remove debug imports before production
import { DebugController } from './interface-adapters/controllers/DebugController.js';

export class AppContainer {
    // Observability (V7)
    public logger: ILogger;
    public metrics: IMetricsCollector;
    public tracer: ITracer;
    public observability: IObservabilityContext;

    // Services
    public eventDispatcher: InMemoryEventDispatcher;
    public llmService: ILlmService;
    public governanceService: AgentGovernanceService;
    public coordinationService: AgentCoordinationService;
    public promptBuilder: PromptBuilder;

    // V8 Adaptive Agents Services
    public preferenceRegistry: PreferenceRegistry;
    public preferenceSuggestionService: PreferenceSuggestionService;
    public preferenceAuditService: PreferenceAuditService;

    // V9 Feedback Loop Services
    public feedbackCaptureService: FeedbackCaptureService;
    public adaptiveAnalyticsService: AdaptiveAnalyticsService;
    public analyticsService: AnalyticsService;

    // V10 Controlled Adaptation Services
    public adaptationPolicyRepository: InMemoryAdaptationPolicyRepository;
    public adaptationAttemptRepository: InMemoryAutoAdaptationAttemptRepository;
    public adaptationPolicyService: AdaptationPolicyService;
    public autoAdaptationService: AutoAdaptationService;

    // V11 Arbitration Services
    public proposalRepository: InMemoryAgentProposalRepository;
    public conflictRepository: InMemoryConflictRepository;
    public arbitrationPolicyRepository: InMemoryArbitrationPolicyRepository;
    public arbitrationDecisionRepository: InMemoryArbitrationDecisionRepository;
    public proposalService: AgentProposalService;
    public conflictDetectionService: ConflictDetectionService;
    public arbitrationService: AgentArbitrationService;

    // V12 UI/Control Layer Services
    public preferenceProjection: PreferenceProjectionService;
    public suggestionProjection: SuggestionProjectionService;
    public arbitrationProjection: ArbitrationDecisionProjectionService;
    public auditProjection: AuditTrailProjectionService;
    public explanationService: DecisionExplanationService;
    public suggestionApproval: SuggestionApprovalService;
    public escalationApproval: EscalationApprovalService;
    public rollbackService: RollbackService;

    // Repositories
    public goalRepository: PrismaGoalRepository;
    public taskRepository: PrismaTaskRepository;
    public subGoalRepository: PrismaSubGoalRepository;
    public scheduleRepository: PrismaScheduleRepository;
    public agentActionLogRepository: InMemoryAgentActionLogRepository;
    public agentLearningRepository: IAgentLearningRepository;
    public decisionRecordRepository: IDecisionRecordRepository;

    // Use Cases
    public createGoalUseCase: CreateGoal;

    // Controllers
    public createGoalController: CreateGoalController;
    public healthController: HealthController;

    // V13 Admin Control Plane
    public adminPreferencesController: AdminPreferencesController;
    public adminSuggestionsController: AdminSuggestionsController;
    public adminArbitrationsController: AdminArbitrationsController;
    public adminAuditController: AdminAuditController;
    public adminExplanationsController: AdminExplanationsController;
    public adminAuthController: AdminAuthController;
    public adminRouter: AdminRouter;
    public metricsController: MetricsController;

    // V14 Productization
    public jwtService: JwtService;
    public tokenStore: ITokenStore;
    public userStore: IUserStore;
    public jwtAuth: JwtAuth;
    public idempotencyStore: IIdempotencyStore;
    public idempotencyMiddleware: IdempotencyMiddleware;
    public timeoutMiddleware: TimeoutMiddleware;
    public circuitBreakerRegistry: CircuitBreakerRegistry;
    public llmCircuitBreaker: CircuitBreaker;
    public adminMetrics: AdminMetrics;

    // V15 Product UI
    public sessionStore: InMemorySessionStore;
    public sessionAuth: SessionAuth;
    public activityLogRepository: IActivityLogRepository;
    public journalEntryRepository: IJournalEntryRepository;
    public goalProjection: GoalProjectionService;
    public taskProjection: TaskProjectionService;
    public scheduleProjection: ScheduleProjectionService;
    public activityProjection: ActivityProjectionService;
    public createSubGoalUseCase: CreateSubGoal;
    public createTaskUseCase: CreateTask;
    public completeTaskUseCase: CompleteTask;
    public updateGoalUseCase: UpdateGoal;
    public productGoalsController: ProductGoalsController;
    public productSubGoalsController: ProductSubGoalsController;
    public productTasksController: ProductTasksController;
    public productScheduleController: ProductScheduleController;
    public productLogsController: ProductLogsController;
    public productRouter: ProductRouter;

    // TODO: Remove debugController before production
    public debugController: DebugController;

    constructor() {
        // 1. Observability (V7 - initialized first, used everywhere)
        this.logger = new ConsoleLogger({ service: 'bettermark' }, 'info');
        this.metrics = new InMemoryMetricsCollector();
        this.tracer = new SimpleTracer();
        this.observability = {
            logger: this.logger,
            metrics: this.metrics,
            tracer: this.tracer,
        };

        // 2. V8 Adaptive Agents - PreferenceRegistry (initialized early)
        this.preferenceRegistry = PreferenceRegistry.createDefault();

        // 3. Infrastructure
        this.eventDispatcher = new InMemoryEventDispatcher();
        this.llmService = LlmServiceFactory.createFromEnv();
        this.promptBuilder = new PromptBuilder();
        this.goalRepository = new PrismaGoalRepository();
        this.taskRepository = new PrismaTaskRepository();
        this.subGoalRepository = new PrismaSubGoalRepository();
        this.scheduleRepository = new PrismaScheduleRepository();
        this.agentActionLogRepository = new InMemoryAgentActionLogRepository();
        this.agentLearningRepository = new InMemoryAgentLearningRepository(this.preferenceRegistry);
        this.decisionRecordRepository = new InMemoryDecisionRecordRepository();

        // 4. Agent Coordination Service (V7)
        this.coordinationService = new AgentCoordinationService(100, this.observability);

        // 5. Agent Governance Service (V6 + V7 observability + V8 decision records + V14 circuit breaker)
        // Note: Circuit breaker and adminMetrics are set after V14 services are initialized
        this.governanceService = new AgentGovernanceService(
            this.llmService,
            this.promptBuilder,
            this.observability,
            this.decisionRecordRepository
        );
        this.registerAgentPolicies();

        // 6. V8 Adaptive Agents Services
        this.preferenceSuggestionService = new PreferenceSuggestionService(
            this.agentLearningRepository,
            this.decisionRecordRepository,
            this.preferenceRegistry
        );
        this.preferenceAuditService = new PreferenceAuditService(
            this.agentLearningRepository,
            this.preferenceRegistry
        );

        // 7. V9 Feedback Loop Services
        this.feedbackCaptureService = new FeedbackCaptureService(
            this.decisionRecordRepository,
            this.agentLearningRepository,
            this.observability,
            this.preferenceSuggestionService,
            { suggestionThreshold: 10, autoTriggerSuggestions: true }
        );
        this.adaptiveAnalyticsService = new AdaptiveAnalyticsService(
            this.agentLearningRepository,
            this.decisionRecordRepository,
            this.observability
        );
        this.analyticsService = new AnalyticsService(
            this.decisionRecordRepository,
            this.observability
        );

        // 8. V10 Controlled Adaptation Services
        this.adaptationPolicyRepository = new InMemoryAdaptationPolicyRepository();
        this.adaptationAttemptRepository = new InMemoryAutoAdaptationAttemptRepository();
        this.adaptationPolicyService = new AdaptationPolicyService(
            this.adaptationPolicyRepository,
            this.preferenceRegistry,
            this.observability
        );
        this.autoAdaptationService = new AutoAdaptationService(
            this.agentLearningRepository,
            this.adaptationPolicyService,
            this.adaptationAttemptRepository,
            this.preferenceRegistry,
            this.eventDispatcher,
            this.observability
        );

        // 9. V11 Arbitration Services
        this.proposalRepository = new InMemoryAgentProposalRepository();
        this.conflictRepository = new InMemoryConflictRepository();
        this.arbitrationPolicyRepository = new InMemoryArbitrationPolicyRepository();
        this.arbitrationDecisionRepository = new InMemoryArbitrationDecisionRepository();

        this.proposalService = new AgentProposalService(
            this.proposalRepository,
            this.eventDispatcher,
            this.observability
        );

        this.conflictDetectionService = new ConflictDetectionService(
            this.proposalRepository,
            this.conflictRepository,
            this.eventDispatcher,
            this.observability
        );

        this.arbitrationService = new AgentArbitrationService(
            this.proposalRepository,
            this.arbitrationPolicyRepository,
            this.arbitrationDecisionRepository,
            this.conflictRepository,
            this.eventDispatcher,
            this.observability
        );

        // Register default arbitration policy
        this.registerDefaultArbitrationPolicy();

        // Connect V10 auto-adaptation to V11 arbitration
        this.autoAdaptationService.setProposalService(this.proposalService);

        // 10. V12 UI/Control Layer Services
        this.preferenceProjection = new PreferenceProjectionService(
            this.agentLearningRepository,
            this.preferenceRegistry,
            this.adaptationAttemptRepository
        );

        this.suggestionProjection = new SuggestionProjectionService(
            this.agentLearningRepository,
            this.preferenceRegistry,
            this.adaptationPolicyService
        );

        this.arbitrationProjection = new ArbitrationDecisionProjectionService(
            this.arbitrationDecisionRepository,
            this.proposalRepository
        );

        this.auditProjection = new AuditTrailProjectionService(
            this.arbitrationDecisionRepository,
            this.proposalRepository,
            this.adaptationAttemptRepository
        );

        this.explanationService = new DecisionExplanationService(
            this.arbitrationDecisionRepository,
            this.arbitrationPolicyRepository,
            this.proposalRepository,
            this.adaptationAttemptRepository,
            this.adaptationPolicyService
        );

        this.suggestionApproval = new SuggestionApprovalService(
            this.agentLearningRepository,
            this.eventDispatcher,
            this.proposalService,
            this.observability
        );

        this.escalationApproval = new EscalationApprovalService(
            this.arbitrationDecisionRepository,
            this.proposalRepository,
            this.eventDispatcher,
            this.observability
        );

        this.rollbackService = new RollbackService(
            this.agentLearningRepository,
            this.arbitrationDecisionRepository,
            this.proposalRepository,
            this.adaptationAttemptRepository,
            this.autoAdaptationService,
            this.eventDispatcher,
            this.observability
        );

        this.logger.info('V12: UI/Control Layer services initialized');

        // 10.5 V14 Productization Services
        this.jwtService = new JwtService();
        this.tokenStore = new InMemoryTokenStore(60000); // Cleanup every minute
        this.userStore = new InMemoryUserStore();
        this.jwtAuth = new JwtAuth(this.jwtService);
        this.idempotencyStore = new InMemoryIdempotencyStore(60000); // Cleanup every minute
        this.idempotencyMiddleware = new IdempotencyMiddleware(this.idempotencyStore);
        this.timeoutMiddleware = new TimeoutMiddleware();
        this.circuitBreakerRegistry = new CircuitBreakerRegistry();
        this.llmCircuitBreaker = this.circuitBreakerRegistry.getOrCreate({
            name: 'llm',
            ...LLM_CIRCUIT_BREAKER_CONFIG,
            onStateChange: (from, to) => {
                this.logger.info('V14: Circuit breaker state change', {
                    service: 'llm',
                    from,
                    to,
                });
            },
        });
        this.adminMetrics = new AdminMetrics(this.metrics);

        // V14: Wire circuit breaker and metrics to governance service
        this.governanceService.setCircuitBreaker(this.llmCircuitBreaker);
        this.governanceService.setAdminMetrics(this.adminMetrics);

        this.logger.info('V14: Productization services initialized');

        // 11. Agents / Handlers (Dependency Injection with Governance + Learning)
        // Subscribe to V10 auto-adaptation events
        this.eventDispatcher.subscribe('PreferenceAutoApplied', {
            handle: async (event) => {
                const e = event as PreferenceAutoApplied;
                this.logger.info('V10: Preference auto-applied', {
                    agentName: e.agentName,
                    preference: `${e.category}.${e.key}`,
                    newValue: e.newValue,
                });
            },
        });
        this.eventDispatcher.subscribe('PreferenceAutoBlocked', {
            handle: async (event) => {
                const e = event as PreferenceAutoBlocked;
                this.logger.info('V10: Auto-adaptation blocked', {
                    agentName: e.agentName,
                    reason: e.blockReason,
                });
            },
        });

        this.eventDispatcher.subscribe('GoalCompleted', new CoachAgentHandler(
            this.goalRepository,
            this.governanceService,
            this.agentActionLogRepository,
            this.agentLearningRepository
        ));
        this.eventDispatcher.subscribe('GoalCreated', new LoggerAgentHandler(
            this.llmService,
            this.agentActionLogRepository,
            this.agentLearningRepository,
            this.governanceService
        ));
        this.eventDispatcher.subscribe('ScheduleConflictDetected', new PlannerAgentHandler(
            this.scheduleRepository,
            this.agentActionLogRepository,
            this.agentLearningRepository,
            this.governanceService
        ));

        // 9. Use Cases
        this.createGoalUseCase = new CreateGoal(this.goalRepository, this.eventDispatcher);

        // 10. Interface Adapters
        this.createGoalController = new CreateGoalController(this.createGoalUseCase);
        this.healthController = new HealthController(this.eventDispatcher);

        // 11. V13 Admin Control Plane Controllers and Router (V14: with metrics)
        this.adminPreferencesController = new AdminPreferencesController(
            this.preferenceProjection,
            this.rollbackService,
            this.adminMetrics
        );
        this.adminSuggestionsController = new AdminSuggestionsController(
            this.suggestionProjection,
            this.suggestionApproval,
            this.adminMetrics
        );
        this.adminArbitrationsController = new AdminArbitrationsController(
            this.arbitrationProjection,
            this.escalationApproval,
            this.rollbackService,
            this.adminMetrics
        );
        this.adminAuditController = new AdminAuditController(
            this.auditProjection
        );
        this.adminExplanationsController = new AdminExplanationsController(
            this.explanationService
        );
        this.adminAuthController = new AdminAuthController(
            this.jwtService,
            this.tokenStore,
            this.userStore
        );
        this.metricsController = new MetricsController(this.metrics);

        this.adminRouter = new AdminRouter({
            preferencesController: this.adminPreferencesController,
            suggestionsController: this.adminSuggestionsController,
            arbitrationsController: this.adminArbitrationsController,
            auditController: this.adminAuditController,
            explanationsController: this.adminExplanationsController,
            authController: this.adminAuthController,
            jwtAuth: this.jwtAuth,
            idempotencyMiddleware: this.idempotencyMiddleware,
            timeoutMiddleware: this.timeoutMiddleware,
            adminMetrics: this.adminMetrics,
        });

        this.logger.info('V13: Admin Control Plane initialized');
        this.logger.info('V14: Production hardening complete');

        // 12. V15 Product UI Services
        this.sessionStore = new InMemorySessionStore(60000); // Cleanup every minute
        this.sessionAuth = new SessionAuth(this.sessionStore);
        this.activityLogRepository = new InMemoryActivityLogRepository();
        this.journalEntryRepository = new InMemoryJournalEntryRepository();

        // V15 Projection Services
        this.goalProjection = new GoalProjectionService(
            this.goalRepository,
            this.subGoalRepository,
            this.taskRepository
        );
        this.taskProjection = new TaskProjectionService(
            this.goalRepository,
            this.subGoalRepository,
            this.taskRepository,
            this.scheduleRepository
        );
        this.scheduleProjection = new ScheduleProjectionService(
            this.goalRepository,
            this.subGoalRepository,
            this.taskRepository,
            this.scheduleRepository
        );
        this.activityProjection = new ActivityProjectionService(
            this.goalRepository,
            this.taskRepository,
            this.activityLogRepository,
            this.journalEntryRepository
        );

        // V15 Use Cases
        this.createSubGoalUseCase = new CreateSubGoal(
            this.goalRepository,
            this.subGoalRepository,
            this.eventDispatcher
        );
        this.createTaskUseCase = new CreateTask(
            this.subGoalRepository,
            this.taskRepository,
            this.eventDispatcher
        );
        this.completeTaskUseCase = new CompleteTask(
            this.taskRepository,
            this.subGoalRepository,
            this.goalRepository,
            this.eventDispatcher
        );
        this.updateGoalUseCase = new UpdateGoal(this.goalRepository);

        // V15 Controllers
        this.productGoalsController = new ProductGoalsController(
            this.goalProjection,
            this.createGoalUseCase,
            this.updateGoalUseCase
        );
        this.productSubGoalsController = new ProductSubGoalsController(
            this.createSubGoalUseCase
        );
        this.productTasksController = new ProductTasksController(
            this.taskProjection,
            this.createTaskUseCase,
            this.completeTaskUseCase
        );
        this.productScheduleController = new ProductScheduleController(
            this.scheduleProjection,
            this.scheduleRepository,
            this.taskRepository
        );
        this.productLogsController = new ProductLogsController(
            this.activityProjection,
            this.activityLogRepository,
            this.journalEntryRepository
        );

        // V15 Product Router
        this.productRouter = new ProductRouter({
            goalsController: this.productGoalsController,
            subGoalsController: this.productSubGoalsController,
            tasksController: this.productTasksController,
            scheduleController: this.productScheduleController,
            logsController: this.productLogsController,
            sessionAuth: this.sessionAuth,
            idempotencyMiddleware: this.idempotencyMiddleware,
            timeoutMiddleware: this.timeoutMiddleware,
            adminMetrics: this.adminMetrics,
        });

        this.logger.info('V15: Product UI initialized');

        // TODO: Remove debug controller initialization before production
        this.debugController = new DebugController(
            this.eventDispatcher,
            this.goalRepository,
            this.taskRepository,
            this.suggestionProjection
        );
        this.logger.warn('DEBUG: Debug endpoints enabled - disable before production');
    }

    /**
     * Registers agent policies for governance.
     * Policies define rate limits, confidence thresholds, and fallback behavior.
     */
    private registerAgentPolicies(): void {
        // CoachAgent: Moderate settings with AI enabled
        this.governanceService.registerPolicy(AgentPolicy.create({
            agentName: 'CoachAgent',
            maxSuggestionsPerEvent: 3,
            confidenceThreshold: 0.7,
            cooldownMs: 30000, // 30 seconds
            aiEnabled: true,
            fallbackToRules: true,
        }));

        // PlannerAgent: Conservative, rule-based only
        this.governanceService.registerPolicy(AgentPolicy.conservative('PlannerAgent'));

        // LoggerAgent: Permissive, mostly logging
        this.governanceService.registerPolicy(AgentPolicy.permissive('LoggerAgent'));
    }

    /**
     * Registers default arbitration policy for V11.
     * This policy defines how conflicts between agents are resolved.
     */
    private registerDefaultArbitrationPolicy(): void {
        const defaultPolicy = ArbitrationPolicyBuilder.create()
            .withId('default-arbitration-policy')
            .withName('Default Arbitration Policy')
            .withDescription('Priority-based resolution with escalation for high-risk actions')
            .withScope('global')
            .withStrategy('priority')
            .withPriorityOrder(['CoachAgent', 'PlannerAgent', 'LoggerAgent'])
            .withWeights({ confidence: 1.0, cost: 0.5, risk: 0.5 })
            .withEscalationRule({
                riskThreshold: 'high',
                confidenceThreshold: 0.3,
                onMultiAgentConflict: false,
            })
            .withDefault(true)
            .build();

        this.arbitrationPolicyRepository.save(defaultPolicy);

        this.logger.info('V11: Default arbitration policy registered', {
            policyId: defaultPolicy.id,
            strategy: defaultPolicy.resolutionStrategy,
            priorityOrder: defaultPolicy.priorityOrder,
        });
    }
}
