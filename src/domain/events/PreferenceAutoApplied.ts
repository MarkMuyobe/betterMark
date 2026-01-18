/**
 * PreferenceAutoApplied - V10 domain event emitted when a preference is auto-applied.
 */

import { IDomainEvent } from './IDomainEvent.js';
import { IAutoAdaptationAttempt } from '../entities/AutoAdaptationAttempt.js';

export class PreferenceAutoApplied implements IDomainEvent {
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

    get previousValue(): unknown {
        return this.attempt.previousValue;
    }

    get newValue(): unknown {
        return this.attempt.suggestedValue;
    }

    get suggestionId(): string {
        return this.attempt.suggestionId;
    }
}
