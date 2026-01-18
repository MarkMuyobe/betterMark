/**
 * PreferenceAutoBlocked - V10 domain event emitted when auto-adaptation is blocked.
 */

import { IDomainEvent } from './IDomainEvent.js';
import { IAutoAdaptationAttempt, BlockReason } from '../entities/AutoAdaptationAttempt.js';

export class PreferenceAutoBlocked implements IDomainEvent {
    public dateTimeOccurred: Date;
    public attempt: IAutoAdaptationAttempt;

    constructor(attempt: IAutoAdaptationAttempt) {
        this.dateTimeOccurred = new Date();
        this.attempt = attempt;
    }

    getAggregateId(): string {
        return this.attempt.id;
    }

    get agentName(): string {
        return this.attempt.agentName;
    }

    get category(): string {
        return this.attempt.category;
    }

    get key(): string {
        return this.attempt.key;
    }

    get blockReason(): BlockReason | undefined {
        return this.attempt.blockReason;
    }

    get suggestionId(): string {
        return this.attempt.suggestionId;
    }

    get confidence(): number {
        return this.attempt.confidence;
    }
}
