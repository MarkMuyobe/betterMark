import { IEventHandler } from '../ports/IEventDispatcher.js';
import { IScheduleRepository } from '../ports/IScheduleRepository.js';
import { IAgentActionLogRepository } from '../ports/IAgentActionLogRepository.js';
import { ScheduleConflictDetected } from '../../domain/events/ScheduleConflictDetected.js';
import { TimeRange } from '../../domain/value-objects/TimeRange.js';
import { IAgentActionLog } from '../../domain/entities/AgentActionLog.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

export class PlannerAgentHandler implements IEventHandler<ScheduleConflictDetected> {
    constructor(
        private scheduleRepository: IScheduleRepository,
        private actionLogRepository: IAgentActionLogRepository
    ) { }

    async handle(event: ScheduleConflictDetected): Promise<void> {
        console.log(`[PlannerAgent] Handling conflict for Task ${event.taskId}. Conflict with Block ${event.conflictingBlockId}.`);

        // 1. Calculate duration of intended block
        const durationMs = event.requestedTimeRange.end.getTime() - event.requestedTimeRange.start.getTime();

        // 2. Simple Heuristic: Look for next free slot starting 1 hour after conflict
        const searchStart = new Date(event.requestedTimeRange.end.getTime() + (60 * 60 * 1000)); // +1 hour
        const searchEnd = new Date(searchStart.getTime() + durationMs);
        const searchRange = new TimeRange(searchStart, searchEnd);

        const conflicts = await this.scheduleRepository.getBlocksSafe(searchRange);

        let actionTaken: string;
        if (conflicts.length === 0) {
            actionTaken = `Proposed reschedule to ${searchStart.toISOString()} - ${searchEnd.toISOString()}`;
            console.log(`[PlannerAgent] Proposal: ${actionTaken}`);
        } else {
            actionTaken = 'Could not find immediate slot. Manual intervention required.';
            console.log(`[PlannerAgent] Proposal: ${actionTaken}`);
        }

        // Log the action
        const actionLog: IAgentActionLog = {
            id: IdGenerator.generate(),
            timestamp: new Date(),
            agentName: 'PlannerAgent',
            eventReceived: 'ScheduleConflictDetected',
            eventAggregateId: event.taskId,
            reasoningSource: 'rule', // Heuristic-based
            actionTaken: actionTaken,
            details: { conflictingBlockId: event.conflictingBlockId, searchedRange: { start: searchStart, end: searchEnd } }
        };
        await this.actionLogRepository.save(actionLog);
    }
}
