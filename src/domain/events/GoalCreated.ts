import { IDomainEvent } from './IDomainEvent.js';
import { IGoal } from '../entities/Goal.js';

export class GoalCreated implements IDomainEvent {
    public dateTimeOccurred: Date;
    public goal: IGoal;

    constructor(goal: IGoal) {
        this.dateTimeOccurred = new Date();
        this.goal = goal;
    }

    getAggregateId(): string {
        return this.goal.id;
    }
}
