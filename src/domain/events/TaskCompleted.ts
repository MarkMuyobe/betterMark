import { IDomainEvent } from './IDomainEvent.js';

export class TaskCompleted implements IDomainEvent {
    public dateTimeOccurred: Date;

    constructor(
        public taskId: string,
        public subGoalId: string
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.taskId;
    }
}
