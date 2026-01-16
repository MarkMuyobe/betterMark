import { IEventHandler } from '../ports/IEventDispatcher.js';
import { IGoalRepository } from '../ports/IGoalRepository.js';
import { ILlmService } from '../ports/ILlmService.js';
import { IAgentActionLogRepository } from '../ports/IAgentActionLogRepository.js';
import { GoalCompleted } from '../../domain/events/GoalCompleted.js';
import { IAgentActionLog } from '../../domain/entities/AgentActionLog.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

export class CoachAgentHandler implements IEventHandler<GoalCompleted> {
    constructor(
        private goalRepository: IGoalRepository,
        private llmService: ILlmService,
        private actionLogRepository: IAgentActionLogRepository
    ) { }

    async handle(event: GoalCompleted): Promise<void> {
        const goal = await this.goalRepository.findById(event.goalId);
        if (!goal) return;

        console.log(`[CoachAgent] Analyzing completed goal: ${goal.title}`);

        // Use LLM to generate feedback/suggestion
        const prompt = `Goal Completed: ${goal.title}. Difficulty: ${goal.difficulty}. Suggest next step.`;
        const suggestion = await this.llmService.generateText(prompt);

        console.log(`[CoachAgent] Suggestion: ${suggestion}`);

        // Log the action
        const actionLog: IAgentActionLog = {
            id: IdGenerator.generate(),
            timestamp: new Date(),
            agentName: 'CoachAgent',
            eventReceived: 'GoalCompleted',
            eventAggregateId: event.goalId,
            reasoningSource: 'llm',
            actionTaken: `Generated suggestion: "${suggestion}"`,
            details: { prompt, response: suggestion }
        };
        await this.actionLogRepository.save(actionLog);
    }
}
