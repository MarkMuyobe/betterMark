import { PrismaGoalRepository } from './infrastructure/persistence/repositories/PrismaGoalRepository.js';
import { PrismaTaskRepository } from './infrastructure/persistence/repositories/PrismaTaskRepository.js';
import { PrismaSubGoalRepository } from './infrastructure/persistence/repositories/PrismaSubGoalRepository.js';
import { PrismaScheduleRepository } from './infrastructure/persistence/repositories/PrismaScheduleRepository.js';
import { InMemoryAgentActionLogRepository } from './infrastructure/persistence/in-memory/InMemoryAgentActionLogRepository.js';
import { InMemoryEventDispatcher } from './infrastructure/messaging/InMemoryEventDispatcher.js';
import { MockLlmService } from './infrastructure/ai/MockLlmService.js';
import { CreateGoal } from './application/use-cases/implementation/CreateGoal.js';
import { CreateGoalController } from './interface-adapters/controllers/CreateGoalController.js';
import { CoachAgentHandler } from './application/handlers/CoachAgentHandler.js';
import { LoggerAgentHandler } from './application/handlers/LoggerAgentHandler.js';
import { PlannerAgentHandler } from './application/handlers/PlannerAgentHandler.js';
import { HealthController } from './interface-adapters/controllers/HealthController.js';

export class AppContainer {
    // Services
    public eventDispatcher: InMemoryEventDispatcher;
    public llmService: MockLlmService;

    // Repositories
    public goalRepository: PrismaGoalRepository;
    public taskRepository: PrismaTaskRepository;
    public subGoalRepository: PrismaSubGoalRepository;
    public scheduleRepository: PrismaScheduleRepository;
    public agentActionLogRepository: InMemoryAgentActionLogRepository;

    // Use Cases
    public createGoalUseCase: CreateGoal;

    // Controllers
    public createGoalController: CreateGoalController;
    public healthController: HealthController;

    constructor() {
        // 1. Infrastructure
        this.eventDispatcher = new InMemoryEventDispatcher();
        this.llmService = new MockLlmService();
        this.goalRepository = new PrismaGoalRepository();
        this.taskRepository = new PrismaTaskRepository();
        this.subGoalRepository = new PrismaSubGoalRepository();
        this.scheduleRepository = new PrismaScheduleRepository();
        this.agentActionLogRepository = new InMemoryAgentActionLogRepository();

        // 2. Agents / Handlers (Dependency Injection)
        this.eventDispatcher.subscribe('GoalCompleted', new CoachAgentHandler(this.goalRepository, this.llmService, this.agentActionLogRepository));
        this.eventDispatcher.subscribe('GoalCreated', new LoggerAgentHandler(this.llmService, this.agentActionLogRepository));
        this.eventDispatcher.subscribe('ScheduleConflictDetected', new PlannerAgentHandler(this.scheduleRepository, this.agentActionLogRepository));

        // 3. Use Cases
        this.createGoalUseCase = new CreateGoal(this.goalRepository, this.eventDispatcher);

        // 4. Interface Adapters
        this.createGoalController = new CreateGoalController(this.createGoalUseCase);
        this.healthController = new HealthController(this.eventDispatcher);
    }
}
