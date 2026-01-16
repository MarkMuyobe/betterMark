import { IDomainEvent } from './IDomainEvent.js';

export class GoalCompleted implements IDomainEvent {
    public dateTimeOccurred: Date;

    constructor(public goalId: string) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.goalId;
    }
}
