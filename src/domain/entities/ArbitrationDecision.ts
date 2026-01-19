/**
 * ArbitrationDecision - V11 entity representing the final outcome of arbitration.
 *
 * Every conflict resolution produces an ArbitrationDecision for auditability.
 * No execution is permitted without referencing a decision.
 */

import { ResolutionStrategy } from './ArbitrationPolicy.js';

/**
 * A detected conflict between proposals.
 */
export interface IConflict {
    id: string;
    /** IDs of proposals in conflict */
    proposalIds: string[];
    /** Type of conflict */
    conflictType: 'same_target' | 'mutually_exclusive' | 'resource_competition' | 'invariant_violation';
    /** Description of the conflict */
    description: string;
    /** Target reference (what they're competing for) */
    targetRef: {
        type: string;
        id: string;
        key?: string;
    };
    detectedAt: Date;
}

/**
 * Outcome of arbitration.
 */
export type ArbitrationOutcome =
    | 'winner_selected'     // One proposal won
    | 'all_vetoed'          // All proposals blocked by veto
    | 'escalated'           // Requires human approval
    | 'no_conflict';        // No actual conflict (single proposal)

/**
 * An arbitration decision.
 */
export interface IArbitrationDecision {
    id: string;
    conflictId: string;

    /** ID of the winning proposal (if any) */
    winningProposalId: string | null;
    /** IDs of suppressed proposals */
    suppressedProposalIds: string[];
    /** IDs of vetoed proposals */
    vetoedProposalIds: string[];

    /** Strategy used to make the decision */
    strategyUsed: ResolutionStrategy;
    /** Policy ID that was applied */
    policyId: string;

    /** Human-readable reasoning */
    reasoningSummary: string;
    /** Detailed factors that influenced the decision */
    decisionFactors: IDecisionFactor[];

    /** Outcome of the arbitration */
    outcome: ArbitrationOutcome;
    /** Whether human approval is required */
    requiresHumanApproval: boolean;
    /** Whether the winning action has been executed */
    executed: boolean;
    /** When it was executed (if applicable) */
    executedAt?: Date;

    createdAt: Date;
}

/**
 * A factor that influenced the decision.
 */
export interface IDecisionFactor {
    proposalId: string;
    agentName: string;
    factor: string;
    value: string | number;
    impact: 'positive' | 'negative' | 'neutral';
}

/**
 * Builder for ArbitrationDecision.
 */
export class ArbitrationDecisionBuilder {
    private decision: Partial<IArbitrationDecision> = {
        suppressedProposalIds: [],
        vetoedProposalIds: [],
        decisionFactors: [],
        requiresHumanApproval: false,
        executed: false,
    };

    static create(): ArbitrationDecisionBuilder {
        return new ArbitrationDecisionBuilder();
    }

    withId(id: string): this {
        this.decision.id = id;
        return this;
    }

    withConflictId(conflictId: string): this {
        this.decision.conflictId = conflictId;
        return this;
    }

    withWinner(proposalId: string): this {
        this.decision.winningProposalId = proposalId;
        this.decision.outcome = 'winner_selected';
        return this;
    }

    withSuppressedProposals(ids: string[]): this {
        this.decision.suppressedProposalIds = ids;
        return this;
    }

    withVetoedProposals(ids: string[]): this {
        this.decision.vetoedProposalIds = ids;
        return this;
    }

    withStrategy(strategy: ResolutionStrategy): this {
        this.decision.strategyUsed = strategy;
        return this;
    }

    withPolicy(policyId: string): this {
        this.decision.policyId = policyId;
        return this;
    }

    withReasoning(summary: string): this {
        this.decision.reasoningSummary = summary;
        return this;
    }

    withFactor(factor: IDecisionFactor): this {
        this.decision.decisionFactors = [...(this.decision.decisionFactors ?? []), factor];
        return this;
    }

    withOutcome(outcome: ArbitrationOutcome): this {
        this.decision.outcome = outcome;
        return this;
    }

    withEscalation(): this {
        this.decision.requiresHumanApproval = true;
        this.decision.outcome = 'escalated';
        return this;
    }

    withAllVetoed(): this {
        this.decision.outcome = 'all_vetoed';
        this.decision.winningProposalId = null;
        return this;
    }

    build(): IArbitrationDecision {
        if (!this.decision.id || !this.decision.conflictId) {
            throw new Error('ArbitrationDecision requires id and conflictId');
        }

        return {
            id: this.decision.id,
            conflictId: this.decision.conflictId,
            winningProposalId: this.decision.winningProposalId ?? null,
            suppressedProposalIds: this.decision.suppressedProposalIds ?? [],
            vetoedProposalIds: this.decision.vetoedProposalIds ?? [],
            strategyUsed: this.decision.strategyUsed ?? 'priority',
            policyId: this.decision.policyId ?? '',
            reasoningSummary: this.decision.reasoningSummary ?? '',
            decisionFactors: this.decision.decisionFactors ?? [],
            outcome: this.decision.outcome ?? 'no_conflict',
            requiresHumanApproval: this.decision.requiresHumanApproval ?? false,
            executed: this.decision.executed ?? false,
            createdAt: new Date(),
        };
    }
}

/**
 * Helper functions for working with arbitration decisions.
 */
export const ArbitrationDecisionUtils = {
    /**
     * Mark decision as executed.
     */
    markExecuted(decision: IArbitrationDecision): IArbitrationDecision {
        return {
            ...decision,
            executed: true,
            executedAt: new Date(),
        };
    },

    /**
     * Check if decision can be executed.
     */
    canExecute(decision: IArbitrationDecision): boolean {
        if (decision.executed) return false;
        if (decision.requiresHumanApproval) return false;
        if (decision.outcome === 'all_vetoed') return false;
        if (decision.outcome === 'escalated') return false;
        return decision.winningProposalId !== null;
    },

    /**
     * Get a summary of the decision.
     */
    getSummary(decision: IArbitrationDecision): string {
        switch (decision.outcome) {
            case 'winner_selected':
                return `Winner selected using ${decision.strategyUsed} strategy. ` +
                    `${decision.suppressedProposalIds.length} proposal(s) suppressed.`;
            case 'all_vetoed':
                return `All ${decision.vetoedProposalIds.length} proposal(s) vetoed.`;
            case 'escalated':
                return `Decision escalated for human approval.`;
            case 'no_conflict':
                return `No conflict detected, single proposal processed.`;
            default:
                return 'Unknown outcome.';
        }
    },
};

/**
 * Builder for Conflict.
 */
export class ConflictBuilder {
    private conflict: Partial<IConflict> = {
        proposalIds: [],
    };

    static create(): ConflictBuilder {
        return new ConflictBuilder();
    }

    withId(id: string): this {
        this.conflict.id = id;
        return this;
    }

    withProposals(ids: string[]): this {
        this.conflict.proposalIds = ids;
        return this;
    }

    withType(type: IConflict['conflictType']): this {
        this.conflict.conflictType = type;
        return this;
    }

    withDescription(description: string): this {
        this.conflict.description = description;
        return this;
    }

    withTarget(targetRef: IConflict['targetRef']): this {
        this.conflict.targetRef = targetRef;
        return this;
    }

    build(): IConflict {
        if (!this.conflict.id || !this.conflict.proposalIds?.length || !this.conflict.conflictType) {
            throw new Error('Conflict requires id, proposalIds, and conflictType');
        }

        return {
            id: this.conflict.id,
            proposalIds: this.conflict.proposalIds,
            conflictType: this.conflict.conflictType,
            description: this.conflict.description ?? '',
            targetRef: this.conflict.targetRef ?? { type: 'unknown', id: '' },
            detectedAt: new Date(),
        };
    }
}
