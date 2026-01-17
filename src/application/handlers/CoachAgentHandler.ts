import { IEventHandler } from '../ports/IEventDispatcher.js';
import { IGoalRepository } from '../ports/IGoalRepository.js';
import { IAgentActionLogRepository } from '../ports/IAgentActionLogRepository.js';
import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { GoalCompleted } from '../../domain/events/GoalCompleted.js';
import { AgentActionLogBuilder } from '../../domain/entities/AgentActionLog.js';
import { AgentLearningProfileUtils } from '../../domain/entities/AgentLearningProfile.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { AgentGovernanceService, DecisionEventInfo } from '../services/AgentGovernanceService.js';
import { COACH_GOAL_COMPLETED } from '../ai/PromptTemplates.js';
import { CoachTone } from '../../domain/value-objects/PreferenceTypes.js';

const AGENT_NAME = 'CoachAgent';

const TONE_DEFAULTS: Record<CoachTone, { prefix: string; suffix: string }> = {
    encouraging: { prefix: 'Great work! ', suffix: ' Keep pushing forward!' },
    neutral: { prefix: '', suffix: '' },
    direct: { prefix: '', suffix: ' Focus on your next objective.' },
    gentle: { prefix: 'Well done. ', suffix: ' Take your time with the next step.' },
};

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
        private actionLogRepository: IAgentActionLogRepository,
        private learningRepository?: IAgentLearningRepository
    ) { }

    /**
     * Read preferred tone from learning profile.
     */
    private async getPreferredTone(): Promise<CoachTone> {
        if (!this.learningRepository) return 'encouraging';

        const profile = await this.learningRepository.findByAgentName(AGENT_NAME);
        if (!profile) return 'encouraging';

        return AgentLearningProfileUtils.getPreference<CoachTone>(
            profile,
            'communication',
            'tone',
            'encouraging'
        );
    }

    /**
     * Apply tone styling to a message.
     */
    private applyTone(message: string, tone: CoachTone): string {
        const style = TONE_DEFAULTS[tone];
        // For 'neutral', return as-is
        if (tone === 'neutral') return message;
        // Apply prefix/suffix based on tone
        return `${style.prefix}${message}${style.suffix}`;
    }

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

        // V9: Display pending preference suggestions (advisory only)
        await this.displayPendingSuggestions();

        // Read preferred tone from learning profile
        const preferredTone = await this.getPreferredTone();
        console.log(`[${AGENT_NAME}] Using tone: ${preferredTone}`);

        console.log(`[${AGENT_NAME}] Analyzing completed goal: ${goal.title}`);

        // Prepare decision event info for V8 feedback capture
        const decisionEventInfo: DecisionEventInfo = {
            triggeringEventType: 'GoalCompleted',
            triggeringEventId: eventId,
            aggregateType: 'Goal',
            aggregateId: event.goalId,
            decisionType: 'suggestion',
        };

        // Generate suggestion with governance and decision record
        const response = await this.governanceService.generateWithDecisionRecord(
            AGENT_NAME,
            COACH_GOAL_COMPLETED.name,
            {
                goalTitle: goal.title,
                difficulty: goal.difficulty,
                facet: goal.facet,
                tone: preferredTone, // Pass tone to template
            },
            // Fallback rule-based suggestion (with tone applied)
            () => this.applyTone(this.getRuleBasedSuggestion(goal.difficulty), preferredTone),
            decisionEventInfo
        );

        console.log(`[${AGENT_NAME}] Suggestion (${response.reasoningSource}): ${response.content}`);
        console.log(`[${AGENT_NAME}] Decision record ID: ${response.decisionRecordId}`);

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
                decisionRecordId: response.decisionRecordId, // V8: Link to decision record
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

    /**
     * V9: Display pending preference suggestions (advisory only).
     * These are NOT auto-applied - just shown for user awareness.
     */
    private async displayPendingSuggestions(): Promise<void> {
        if (!this.learningRepository) return;

        try {
            const pendingSuggestions = await this.learningRepository.getPendingSuggestions(AGENT_NAME);

            if (pendingSuggestions.length > 0) {
                console.log(`[${AGENT_NAME}] [Advisory] ${pendingSuggestions.length} pending preference suggestion(s):`);
                for (const suggestion of pendingSuggestions) {
                    console.log(`  - ${suggestion.category}.${suggestion.key}: "${suggestion.currentValue}" → "${suggestion.suggestedValue}" (confidence: ${(suggestion.confidence * 100).toFixed(0)}%)`);
                    console.log(`    Reason: ${suggestion.reason}`);
                }
                console.log(`[${AGENT_NAME}] [Advisory] Approve/reject suggestions to update agent behavior.`);
            }
        } catch (error) {
            // Non-critical - just log and continue
            console.log(`[${AGENT_NAME}] Could not fetch pending suggestions: ${error}`);
        }
    }
}
