import { IEventHandler } from '../ports/IEventDispatcher.js';
import { IGoalRepository } from '../ports/IGoalRepository.js';
import { IAgentActionLogRepository } from '../ports/IAgentActionLogRepository.js';
import { GoalCompleted } from '../../domain/events/GoalCompleted.js';
import { AgentActionLogBuilder } from '../../domain/entities/AgentActionLog.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { AgentGovernanceService } from '../services/AgentGovernanceService.js';
import { COACH_GOAL_COMPLETED } from '../ai/PromptTemplates.js';

const AGENT_NAME = 'CoachAgent';

/**
 * CoachAgentHandler - Reacts to GoalCompleted events with coaching suggestions.
 *
 * V6 Governance:
 * - Uses AgentGovernanceService for policy enforcement
 * - Respects cooldown periods
 * - Falls back to rule-based suggestions if AI unavailable
 * - Logs all actions with governance metadata
 */
export class CoachAgentHandler implements IEventHandler<GoalCompleted> {
    constructor(
        private goalRepository: IGoalRepository,
        private governanceService: AgentGovernanceService,
        private actionLogRepository: IAgentActionLogRepository
    ) { }

    async handle(event: GoalCompleted): Promise<void> {
        const goal = await this.goalRepository.findById(event.goalId);
        if (!goal) return;

        // Check cooldown
        if (!this.governanceService.canTakeAction(AGENT_NAME, event.goalId)) {
            console.log(`[${AGENT_NAME}] Skipping - cooldown active for goal ${event.goalId}`);
            return;
        }

        // Check suggestion limit
        const eventId = `${event.goalId}-${event.dateTimeOccurred.getTime()}`;
        if (!this.governanceService.canMakeSuggestion(AGENT_NAME, eventId)) {
            console.log(`[${AGENT_NAME}] Skipping - suggestion limit reached for event`);
            return;
        }

        console.log(`[${AGENT_NAME}] Analyzing completed goal: ${goal.title}`);

        // Generate suggestion with governance
        const response = await this.governanceService.generateWithGovernance(
            AGENT_NAME,
            COACH_GOAL_COMPLETED.name,
            {
                goalTitle: goal.title,
                difficulty: goal.difficulty,
                facet: goal.facet,
            },
            // Fallback rule-based suggestion
            () => this.getRuleBasedSuggestion(goal.difficulty)
        );

        console.log(`[${AGENT_NAME}] Suggestion (${response.reasoningSource}): ${response.content}`);

        // Record action and suggestion for rate limiting
        this.governanceService.recordAction(AGENT_NAME, event.goalId);
        this.governanceService.recordSuggestion(AGENT_NAME, eventId);

        // Log with governance metadata
        const actionLog = AgentActionLogBuilder.create()
            .withId(IdGenerator.generate())
            .withAgent(AGENT_NAME)
            .withEvent('GoalCompleted', event.goalId)
            .withReasoning(response.reasoningSource, `Generated suggestion: "${response.content}"`)
            .withDetails({
                goalTitle: goal.title,
                difficulty: goal.difficulty,
                facet: goal.facet,
            })
            .withGovernance(response.governance)
            .build();

        await this.actionLogRepository.save(actionLog);
    }

    /**
     * Rule-based fallback suggestions based on difficulty.
     */
    private getRuleBasedSuggestion(difficulty: string): string {
        switch (difficulty) {
            case 'Easy':
                return 'Great start! Consider increasing the difficulty for your next goal.';
            case 'Medium':
                return 'Well done! You\'re building good momentum. Try a challenging goal next.';
            case 'Hard':
                return 'Excellent work on a difficult goal! Take time to reflect on what you learned.';
            case 'Expert':
                return 'Outstanding achievement! You\'ve mastered this level. Consider mentoring others.';
            default:
                return 'Goal completed successfully. Keep up the good work!';
        }
    }
}
