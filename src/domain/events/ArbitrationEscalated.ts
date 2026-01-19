/**
 * ArbitrationEscalated - V11 event emitted when human approval is required.
 *
 * This event is emitted when the arbitration process determines that
 * automatic resolution is not appropriate and human intervention is needed.
 * The system halts execution until explicit approval is given.
 */

import { IDomainEvent } from './IDomainEvent.js';

/**
 * Reason for escalation.
 */
export type EscalationReason =
    | 'risk_threshold'          // Risk level exceeds policy threshold
    | 'cost_threshold'          // Cost exceeds policy threshold
    | 'confidence_too_low'      // Confidence below policy threshold
    | 'multi_agent_conflict'    // Multiple agents in conflict (policy requires escalation)
    | 'agent_always_escalate'   // Agent is in always-escalate list
    | 'veto_escalation'         // Veto rule triggered escalation
    | 'no_clear_winner';        // No resolution strategy produced a winner

/**
 * Details about a proposal involved in the escalation.
 */
export interface EscalatedProposal {
    proposalId: string;
    agentName: string;
    actionType: string;
    proposedValue: unknown;
    confidenceScore: number;
    costEstimate: number;
    riskLevel: string;
}

/**
 * Event emitted when arbitration is escalated for human approval.
 */
export class ArbitrationEscalated implements IDomainEvent {
    readonly dateTimeOccurred: Date;

    constructor(
        /** ID of the arbitration decision */
        public readonly decisionId: string,
        /** ID of the conflict */
        public readonly conflictId: string,
        /** Primary reason for escalation */
        public readonly reason: EscalationReason,
        /** All proposals involved in the conflict */
        public readonly proposals: EscalatedProposal[],
        /** Policy that triggered the escalation */
        public readonly policyId: string,
        /** Human-readable context for the reviewer */
        public readonly contextSummary: string,
        /** Suggested resolution (optional recommendation) */
        public readonly suggestedResolution?: {
            proposalId: string;
            confidence: number;
            reasoning: string;
        }
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.decisionId;
    }
}
