/**
 * AgentConflictDetected - Event emitted when conflicting agent actions are detected.
 *
 * This event is emitted by the AgentCoordinationService when multiple agents
 * propose conflicting actions on the same aggregate.
 */

import { IDomainEvent } from './IDomainEvent.js';
import { ProposedAction } from './AgentActionProposed.js';

/**
 * Types of conflicts that can occur between agent actions.
 */
export type ConflictType =
    | 'concurrent_modification'  // Multiple agents trying to modify same aggregate
    | 'contradicting_advice'     // Agents giving opposite suggestions
    | 'resource_contention'      // Multiple actions competing for same resource
    | 'rate_limit_exceeded';     // Too many actions in short time

/**
 * Details about a detected conflict.
 */
export interface ConflictDetails {
    /** Agents involved in the conflict */
    conflictingAgents: string[];
    /** The aggregate being contested */
    targetAggregateId: string;
    /** Type of the aggregate */
    targetAggregateType: string;
    /** Type of conflict */
    conflictType: ConflictType;
    /** The conflicting proposed actions */
    proposedActions: Array<{
        proposalId: string;
        agentName: string;
        action: ProposedAction;
        timestamp: Date;
    }>;
}

/**
 * Event emitted when a conflict between agent actions is detected.
 */
export class AgentConflictDetected implements IDomainEvent {
    readonly dateTimeOccurred: Date;

    constructor(
        /** Details about the conflict */
        public readonly conflict: ConflictDetails,
        /** Unique ID for this conflict */
        public readonly conflictId: string
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.conflict.targetAggregateId;
    }
}
