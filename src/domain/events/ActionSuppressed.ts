/**
 * ActionSuppressed - V11 event emitted when a proposal loses arbitration.
 *
 * This event provides visibility into suppressed actions for audit,
 * analytics, and UI explanation purposes. Silent suppression is not
 * allowed - every suppression must be recorded and explained.
 */

import { IDomainEvent } from './IDomainEvent.js';
import { ResolutionStrategy } from '../entities/ArbitrationPolicy.js';

/**
 * Reason why the proposal was suppressed.
 */
export type SuppressionReason =
    | 'lost_priority'       // Another proposal had higher priority
    | 'lower_score'         // Another proposal had higher weighted score
    | 'vetoed'              // Blocked by veto rule
    | 'lost_consensus';     // Did not achieve consensus

/**
 * Event emitted when an agent's proposal is suppressed.
 */
export class ActionSuppressed implements IDomainEvent {
    readonly dateTimeOccurred: Date;

    constructor(
        /** ID of the suppressed proposal */
        public readonly proposalId: string,
        /** Name of the agent whose proposal was suppressed */
        public readonly agentName: string,
        /** ID of the arbitration decision */
        public readonly decisionId: string,
        /** ID of the winning proposal (if any) */
        public readonly winningProposalId: string | null,
        /** Reason for suppression */
        public readonly reason: SuppressionReason,
        /** Strategy that was used */
        public readonly strategyUsed: ResolutionStrategy,
        /** Human-readable explanation */
        public readonly explanation: string,
        /** Score comparison (for weighted strategy) */
        public readonly scoreComparison?: {
            thisProposalScore: number;
            winningScore: number;
        },
        /** Priority comparison (for priority strategy) */
        public readonly priorityComparison?: {
            thisProposalPriority: number;
            winningPriority: number;
        }
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.proposalId;
    }
}
