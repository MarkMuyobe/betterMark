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
import { AgentPolicy } from './domain/value-objects/AgentPolicy.js';
import { PreferenceRegistry } from './domain/services/PreferenceRegistry.js';
import { PromptBuilder } from './application/ai/PromptTemplates.js';
import { ILlmService } from './application/ports/ILlmService.js';
import { LlmServiceFactory } from './infrastructure/ai/LlmServiceFactory.js';
import { IObservabilityContext } from './application/ports/IObservabilityContext.js';
import { ConsoleLogger, ILogger } from './infrastructure/observability/Logger.js';
import { InMemoryMetricsCollector, IMetricsCollector } from './infrastructure/observability/MetricsCollector.js';
import { SimpleTracer, ITracer } from './infrastructure/observability/Tracer.js';

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

        // 5. Agent Governance Service (V6 + V7 observability + V8 decision records)
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

        // 8. Agents / Handlers (Dependency Injection with Governance + Learning)
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
}
