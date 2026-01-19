/**
 * ArbitrationResolved - V11 event emitted when arbitration is complete.
 *
 * This event is emitted after a conflict has been resolved through the
 * arbitration process. It contains the full decision details for audit
 * and analytics purposes.
 */

import { IDomainEvent } from './IDomainEvent.js';
import { ResolutionStrategy } from '../entities/ArbitrationPolicy.js';
import { ArbitrationOutcome } from '../entities/ArbitrationDecision.js';

/**
 * Event emitted when arbitration is resolved.
 */
export class ArbitrationResolved implements IDomainEvent {
    readonly dateTimeOccurred: Date;

    constructor(
        /** ID of the arbitration decision */
        public readonly decisionId: string,
        /** ID of the conflict that was resolved */
        public readonly conflictId: string,
        /** ID of the winning proposal (null if no winner) */
        public readonly winningProposalId: string | null,
        /** IDs of suppressed proposals */
        public readonly suppressedProposalIds: string[],
        /** IDs of vetoed proposals */
        public readonly vetoedProposalIds: string[],
        /** Strategy used for resolution */
        public readonly strategyUsed: ResolutionStrategy,
        /** ID of the policy that was applied */
        public readonly policyId: string,
        /** Outcome of arbitration */
        public readonly outcome: ArbitrationOutcome,
        /** Human-readable explanation */
        public readonly reasoningSummary: string
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.decisionId;
    }
}
