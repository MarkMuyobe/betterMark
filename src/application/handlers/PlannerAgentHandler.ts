import { IEventHandler } from '../ports/IEventDispatcher.js';
import { IScheduleRepository } from '../ports/IScheduleRepository.js';
import { IAgentActionLogRepository } from '../ports/IAgentActionLogRepository.js';
import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { ScheduleConflictDetected } from '../../domain/events/ScheduleConflictDetected.js';
import { TimeRange } from '../../domain/value-objects/TimeRange.js';
import { IAgentActionLog } from '../../domain/entities/AgentActionLog.js';
import { AgentLearningProfileUtils } from '../../domain/entities/AgentLearningProfile.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { AgentGovernanceService, DecisionEventInfo } from '../services/AgentGovernanceService.js';
import { SchedulingAggressiveness } from '../../domain/value-objects/PreferenceTypes.js';

const AGENT_NAME = 'PlannerAgent';

/**
 * Delay multipliers based on aggressiveness.
 * - conservative: Wait longer before rescheduling (2 hours)
 * - moderate: Standard delay (1 hour)
 * - aggressive: Reschedule as soon as possible (15 minutes)
 */
const AGGRESSIVENESS_DELAY_MS: Record<SchedulingAggressiveness, number> = {
    conservative: 2 * 60 * 60 * 1000,  // 2 hours
    moderate: 60 * 60 * 1000,           // 1 hour
    aggressive: 15 * 60 * 1000,         // 15 minutes
};

export class PlannerAgentHandler implements IEventHandler<ScheduleConflictDetected> {
    constructor(
        private scheduleRepository: IScheduleRepository,
        private actionLogRepository: IAgentActionLogRepository,
        private learningRepository?: IAgentLearningRepository,
        private governanceService?: AgentGovernanceService
    ) { }

    /**
     * Read preferred aggressiveness from learning profile.
     */
    private async getPreferredAggressiveness(): Promise<SchedulingAggressiveness> {
        if (!this.learningRepository) return 'moderate';

        const profile = await this.learningRepository.findByAgentName(AGENT_NAME);
        if (!profile) return 'moderate';

        return AgentLearningProfileUtils.getPreference<SchedulingAggressiveness>(
            profile,
            'scheduling',
            'aggressiveness',
            'moderate'
        );
    }

    async handle(event: ScheduleConflictDetected): Promise<void> {
        console.log(`[${AGENT_NAME}] Handling conflict for Task ${event.taskId}. Conflict with Block ${event.conflictingBlockId}.`);

        // Read preferred aggressiveness from learning profile
        const aggressiveness = await this.getPreferredAggressiveness();
        const delayMs = AGGRESSIVENESS_DELAY_MS[aggressiveness];
        console.log(`[${AGENT_NAME}] Using aggressiveness: ${aggressiveness} (delay: ${delayMs / 60000} minutes)`);

        // 1. Calculate duration of intended block
        const durationMs = event.requestedTimeRange.end.getTime() - event.requestedTimeRange.start.getTime();

        // 2. Heuristic: Look for next free slot based on aggressiveness setting
        const searchStart = new Date(event.requestedTimeRange.end.getTime() + delayMs);
        const searchEnd = new Date(searchStart.getTime() + durationMs);
        const searchRange = new TimeRange(searchStart, searchEnd);

        const conflicts = await this.scheduleRepository.getBlocksSafe(searchRange);

        let actionTaken: string;
        if (conflicts.length === 0) {
            actionTaken = `Proposed reschedule to ${searchStart.toISOString()} - ${searchEnd.toISOString()}`;
            console.log(`[${AGENT_NAME}] Proposal: ${actionTaken}`);
        } else {
            actionTaken = 'Could not find immediate slot. Manual intervention required.';
            console.log(`[${AGENT_NAME}] Proposal: ${actionTaken}`);
        }

        // V8: Create decision record for feedback capture
        let decisionRecordId: string | undefined;
        if (this.governanceService) {
            const eventId = `${event.taskId}-${event.dateTimeOccurred.getTime()}`;
            const decisionEventInfo: DecisionEventInfo = {
                triggeringEventType: 'ScheduleConflictDetected',
                triggeringEventId: eventId,
                aggregateType: 'Task',
                aggregateId: event.taskId,
                decisionType: 'reschedule',
            };

            decisionRecordId = await this.governanceService.createDecisionRecord(
                AGENT_NAME,
                actionTaken,
                'heuristic',
                decisionEventInfo
            );
            console.log(`[${AGENT_NAME}] Decision record ID: ${decisionRecordId}`);
        }

        // Log the action
        const actionLog: IAgentActionLog = {
            id: IdGenerator.generate(),
            timestamp: new Date(),
            agentName: AGENT_NAME,
            eventReceived: 'ScheduleConflictDetected',
            eventAggregateId: event.taskId,
            reasoningSource: 'heuristic',
            actionTaken: actionTaken,
            details: {
                conflictingBlockId: event.conflictingBlockId,
                searchedRange: { start: searchStart, end: searchEnd },
                aggressiveness,
                decisionRecordId, // V8: Link to decision record
            }
        };
        await this.actionLogRepository.save(actionLog);
    }
}
