/**
 * AgentActionProposal - V11 Arbitration entity representing an intent, not an action.
 *
 * Agents propose actions through this entity. No side effects are allowed at this stage.
 * All proposals must go through arbitration before execution.
 */

import { RiskLevel } from '../value-objects/PreferenceTypes.js';

/**
 * Types of actions an agent can propose.
 */
export type ProposalActionType =
    | 'ApplyPreference'
    | 'RescheduleTask'
    | 'CreateSuggestion'
    | 'SendNotification'
    | 'UpdateSchedule'
    | 'ModifyGoal';

/**
 * Status of a proposal.
 */
export type ProposalStatus =
    | 'pending'      // Awaiting arbitration
    | 'approved'     // Won arbitration, awaiting execution
    | 'executed'     // Successfully executed
    | 'suppressed'   // Lost arbitration to another proposal
    | 'vetoed'       // Blocked by veto rule
    | 'escalated';   // Requires human approval

/**
 * Reference to the target of the action.
 */
export interface ITargetRef {
    type: 'preference' | 'task' | 'schedule' | 'goal' | 'notification';
    id: string;
    /** For preferences: category.key */
    key?: string;
}

/**
 * An agent action proposal.
 */
export interface IAgentActionProposal {
    id: string;
    agentName: string;
    actionType: ProposalActionType;
    targetRef: ITargetRef;
    proposedValue: unknown;
    confidenceScore: number;
    costEstimate: number;
    riskLevel: RiskLevel;

    /** Event that triggered this proposal */
    originatingEventId: string;
    /** Optional: Suggestion ID if from V10 auto-adaptation */
    suggestionId?: string;

    status: ProposalStatus;
    createdAt: Date;

    /** Set when proposal is processed */
    processedAt?: Date;
    /** ID of the arbitration decision that processed this */
    arbitrationDecisionId?: string;
}

/**
 * Builder for AgentActionProposal.
 */
export class AgentActionProposalBuilder {
    private proposal: Partial<IAgentActionProposal> = {
        status: 'pending',
        costEstimate: 0,
        riskLevel: 'low',
    };

    static create(): AgentActionProposalBuilder {
        return new AgentActionProposalBuilder();
    }

    withId(id: string): this {
        this.proposal.id = id;
        return this;
    }

    withAgent(agentName: string): this {
        this.proposal.agentName = agentName;
        return this;
    }

    withActionType(actionType: ProposalActionType): this {
        this.proposal.actionType = actionType;
        return this;
    }

    withTarget(targetRef: ITargetRef): this {
        this.proposal.targetRef = targetRef;
        return this;
    }

    withProposedValue(value: unknown): this {
        this.proposal.proposedValue = value;
        return this;
    }

    withConfidence(score: number): this {
        this.proposal.confidenceScore = Math.max(0, Math.min(1, score));
        return this;
    }

    withCost(estimate: number): this {
        this.proposal.costEstimate = Math.max(0, estimate);
        return this;
    }

    withRiskLevel(level: RiskLevel): this {
        this.proposal.riskLevel = level;
        return this;
    }

    withOriginatingEvent(eventId: string): this {
        this.proposal.originatingEventId = eventId;
        return this;
    }

    withSuggestionId(suggestionId: string): this {
        this.proposal.suggestionId = suggestionId;
        return this;
    }

    build(): IAgentActionProposal {
        if (!this.proposal.id || !this.proposal.agentName || !this.proposal.actionType || !this.proposal.targetRef) {
            throw new Error('AgentActionProposal requires id, agentName, actionType, and targetRef');
        }

        return {
            id: this.proposal.id,
            agentName: this.proposal.agentName,
            actionType: this.proposal.actionType,
            targetRef: this.proposal.targetRef,
            proposedValue: this.proposal.proposedValue,
            confidenceScore: this.proposal.confidenceScore ?? 0,
            costEstimate: this.proposal.costEstimate ?? 0,
            riskLevel: this.proposal.riskLevel ?? 'low',
            originatingEventId: this.proposal.originatingEventId ?? '',
            suggestionId: this.proposal.suggestionId,
            status: 'pending',
            createdAt: new Date(),
        };
    }
}

/**
 * Helper functions for working with proposals.
 */
export const AgentActionProposalUtils = {
    /**
     * Check if two proposals target the same resource.
     */
    targetsSameResource(a: IAgentActionProposal, b: IAgentActionProposal): boolean {
        if (a.targetRef.type !== b.targetRef.type) return false;
        if (a.targetRef.id !== b.targetRef.id) return false;
        if (a.targetRef.key && b.targetRef.key && a.targetRef.key !== b.targetRef.key) return false;
        return true;
    },

    /**
     * Check if two proposals have mutually exclusive values.
     */
    hasMutuallyExclusiveValues(a: IAgentActionProposal, b: IAgentActionProposal): boolean {
        if (!AgentActionProposalUtils.targetsSameResource(a, b)) return false;
        return a.proposedValue !== b.proposedValue;
    },

    /**
     * Mark proposal as approved.
     */
    approve(proposal: IAgentActionProposal, decisionId: string): IAgentActionProposal {
        return {
            ...proposal,
            status: 'approved',
            processedAt: new Date(),
            arbitrationDecisionId: decisionId,
        };
    },

    /**
     * Mark proposal as executed.
     */
    markExecuted(proposal: IAgentActionProposal): IAgentActionProposal {
        return {
            ...proposal,
            status: 'executed',
        };
    },

    /**
     * Mark proposal as suppressed.
     */
    suppress(proposal: IAgentActionProposal, decisionId: string): IAgentActionProposal {
        return {
            ...proposal,
            status: 'suppressed',
            processedAt: new Date(),
            arbitrationDecisionId: decisionId,
        };
    },

    /**
     * Mark proposal as vetoed.
     */
    veto(proposal: IAgentActionProposal, decisionId: string): IAgentActionProposal {
        return {
            ...proposal,
            status: 'vetoed',
            processedAt: new Date(),
            arbitrationDecisionId: decisionId,
        };
    },

    /**
     * Mark proposal as escalated.
     */
    escalate(proposal: IAgentActionProposal, decisionId: string): IAgentActionProposal {
        return {
            ...proposal,
            status: 'escalated',
            processedAt: new Date(),
            arbitrationDecisionId: decisionId,
        };
    },
};
