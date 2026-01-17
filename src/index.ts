// Domain Layer - Exports
export * from './domain/enums/Facet.js';
export * from './domain/enums/DifficultyProfile.js';
export * from './domain/entities/Goal.js';
export * from './domain/entities/SubGoal.js';
export * from './domain/entities/Task.js';
export * from './domain/entities/ScheduleBlock.js';
export * from './domain/entities/JournalEntry.js';
export * from './domain/entities/ActivityLog.js';
export * from './domain/entities/MetricSnapshot.js';
export * from './domain/entities/Streak.js';
export * from './domain/entities/CoachAgent.js';
export * from './domain/entities/SuperAgent.js';
export * from './domain/value-objects/TimeRange.js';
export * from './domain/interfaces/ICoachAgentBehavior.js';
export * from './domain/interfaces/ISuperAgentBehavior.js';

// Application Layer - Exports
export * from './application/ports/IGoalRepository.js';
export * from './application/ports/IScheduleRepository.js';
export * from './application/ports/IActivityRepository.js';
export * from './application/use-cases/ManageGoals.js';
export * from './application/use-cases/LogActivity.js';
export * from './application/use-cases/ScheduleManagement.js';
export * from './application/use-cases/ProgressTracking.js';
export * from './application/use-cases/implementation/CreateGoal.js';
export * from './application/use-cases/implementation/UpdateGoal.js';
export * from './application/use-cases/implementation/CompleteTask.js';
export * from './application/use-cases/implementation/LogEvent.js';
export * from './application/use-cases/implementation/ScheduleTask.js';

// Domain Layer - Events
export * from './domain/events/IDomainEvent.js';
export * from './domain/events/GoalCreated.js';
export * from './domain/events/GoalCompleted.js';
export * from './domain/events/TaskCompleted.js';
export * from './domain/events/ScheduleConflictDetected.js';

// Application Layer - Handlers & Ports
export * from './application/ports/IEventDispatcher.js';
export * from './application/ports/ILlmService.js';
export * from './application/handlers/CoachAgentHandler.js';
export * from './application/handlers/PlannerAgentHandler.js';
export * from './application/handlers/LoggerAgentHandler.js';

// Infrastructure Layer - Exports
export * from './infrastructure/messaging/InMemoryEventDispatcher.js';
export * from './infrastructure/ai/MockLlmService.js';
export * from './infrastructure/persistence/repositories/PrismaGoalRepository.js';
export * from './infrastructure/persistence/repositories/PrismaTaskRepository.js';
export * from './infrastructure/persistence/repositories/PrismaSubGoalRepository.js';
export * from './infrastructure/persistence/repositories/PrismaScheduleRepository.js';
export * from './infrastructure/persistence/repositories/PrismaActivityRepository.js';

// Shared
export * from './shared/types/Common.js';
export * from './shared/utils/IdGenerator.js';

// V6 Agent Governance
export * from './domain/value-objects/AgentPolicy.js';
export * from './application/services/AgentGovernanceService.js';
export * from './application/ai/PromptTemplates.js';

// V7 AI Integration
export * from './infrastructure/ai/OpenAILlmService.js';
export * from './infrastructure/ai/LlmServiceFactory.js';
export * from './infrastructure/ai/pricing.js';

// V7 Observability
export * from './application/ports/IObservabilityContext.js';
export * from './infrastructure/observability/Logger.js';
export * from './infrastructure/observability/MetricsCollector.js';
export * from './infrastructure/observability/Tracer.js';

// V7 Cross-Agent Coordination
export * from './domain/events/AgentActionProposed.js';
export * from './domain/events/AgentConflictDetected.js';
export * from './application/services/AgentCoordinationService.js';

// V7 Analytics & Reporting
export * from './domain/entities/DecisionRecord.js';
export * from './application/ports/IDecisionRecordRepository.js';
export * from './application/services/AnalyticsService.js';
export * from './infrastructure/persistence/in-memory/InMemoryDecisionRecordRepository.js';
export * from './infrastructure/persistence/repositories/PrismaDecisionRecordRepository.js';

// V8 Preparation (Adaptive Agents)
export * from './domain/entities/AgentLearningProfile.js';
export * from './application/ports/IAgentLearningRepository.js';
export * from './application/services/FeedbackCaptureService.js';
export * from './infrastructure/persistence/in-memory/InMemoryAgentLearningRepository.js';
