/**
 * AgentActionProposed - Event emitted when an agent proposes an action.
 *
 * Agents no longer execute actions directly. Instead, they propose actions
 * which are coordinated by the AgentCoordinationService to prevent conflicts.
 */

import { IDomainEvent } from './IDomainEvent.js';

/**
 * Types of actions agents can propose.
 */
export type ProposedActionType =
    | 'suggestion'       // Provide a suggestion to the user
    | 'notification'     // Send a notification
    | 'reschedule'       // Propose rescheduling a task
    | 'update_goal'      // Propose updating a goal
    | 'create_task'      // Propose creating a new task
    | 'log_activity';    // Log an activity

/**
 * A proposed action from an agent.
 */
export interface ProposedAction {
    /** Type of action being proposed */
    type: ProposedActionType;
    /** The aggregate this action targets */
    targetAggregateId: string;
    /** Type of the target aggregate (e.g., 'Goal', 'Task') */
    targetAggregateType: string;
    /** Action-specific payload */
    payload: Record<string, unknown>;
    /** Priority of this action (higher = more important) */
    priority?: number;
}

/**
 * Event emitted when an agent proposes an action.
 */
export class AgentActionProposed implements IDomainEvent {
    readonly dateTimeOccurred: Date;

    constructor(
        /** Name of the agent proposing the action */
        public readonly agentName: string,
        /** The proposed action */
        public readonly proposedAction: ProposedAction,
        /** ID of the event that triggered this proposal */
        public readonly sourceEventId: string,
        /** Unique ID for this proposal */
        public readonly proposalId: string
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.proposedAction.targetAggregateId;
    }
}
