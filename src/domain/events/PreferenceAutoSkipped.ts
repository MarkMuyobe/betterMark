/**
 * PreferenceAutoSkipped - V10 domain event emitted when auto-adaptation is skipped.
 */

import { IDomainEvent } from './IDomainEvent.js';
import { IAutoAdaptationAttempt, SkipReason } from '../entities/AutoAdaptationAttempt.js';

export class PreferenceAutoSkipped implements IDomainEvent {
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

    get suggestionId(): string {
        return this.attempt.suggestionId;
    }

    get skipReason(): SkipReason | undefined {
        return this.attempt.skipReason;
    }
}
