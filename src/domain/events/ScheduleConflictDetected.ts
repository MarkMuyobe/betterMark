import { IDomainEvent } from './IDomainEvent.js';
import { TimeRange } from '../value-objects/TimeRange.js';

export class ScheduleConflictDetected implements IDomainEvent {
    public dateTimeOccurred: Date;

    constructor(
        public taskId: string,
        public requestedTimeRange: TimeRange,
        public conflictingBlockId: string
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.taskId;
    }
}
