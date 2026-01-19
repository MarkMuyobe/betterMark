/**
 * ArbitrationDecisionReadModel - V12 CQRS-style projection for arbitration decisions.
 *
 * Query-optimized, UI-safe model for displaying arbitration outcomes.
 * This is a read-only projection - no mutations allowed.
 */

import { ResolutionStrategy } from '../../domain/entities/ArbitrationPolicy.js';

/**
 * Read model for arbitration decision display.
 */
export interface ArbitrationDecisionReadModel {
    /** Unique ID of the decision */
    decisionId: string;
    /** ID of the conflict that was resolved */
    conflictId: string;
    /** Name of the winning agent (null if all vetoed/escalated) */
    winningAgent: string | null;
    /** Summary of the winning action */
    winningActionSummary: string | null;
    /** Names of agents whose proposals were suppressed */
    suppressedAgents: string[];
    /** Strategy used for resolution */
    strategyUsed: ResolutionStrategy;
    /** Human-readable reasoning for the decision */
    reasoningSummary: string;
    /** Whether this decision was escalated for human approval */
    escalated: boolean;
    /** Whether this decision has been executed */
    executed: boolean;
    /** When the decision was made */
    resolvedAt: Date;
    /** When it was executed (if applicable) */
    executedAt?: Date;
}

/**
 * Builder for ArbitrationDecisionReadModel.
 */
export class ArbitrationDecisionReadModelBuilder {
    private model: Partial<ArbitrationDecisionReadModel> = {
        suppressedAgents: [],
        escalated: false,
        executed: false,
    };

    static create(): ArbitrationDecisionReadModelBuilder {
        return new ArbitrationDecisionReadModelBuilder();
    }

    withDecisionId(id: string): this {
        this.model.decisionId = id;
        return this;
    }

    withConflictId(id: string): this {
        this.model.conflictId = id;
        return this;
    }

    withWinningAgent(agent: string | null): this {
        this.model.winningAgent = agent;
        return this;
    }

    withWinningActionSummary(summary: string | null): this {
        this.model.winningActionSummary = summary;
        return this;
    }

    withSuppressedAgents(agents: string[]): this {
        this.model.suppressedAgents = agents;
        return this;
    }

    withStrategyUsed(strategy: ResolutionStrategy): this {
        this.model.strategyUsed = strategy;
        return this;
    }

    withReasoningSummary(summary: string): this {
        this.model.reasoningSummary = summary;
        return this;
    }

    withEscalated(escalated: boolean): this {
        this.model.escalated = escalated;
        return this;
    }

    withExecuted(executed: boolean, executedAt?: Date): this {
        this.model.executed = executed;
        this.model.executedAt = executedAt;
        return this;
    }

    withResolvedAt(date: Date): this {
        this.model.resolvedAt = date;
        return this;
    }

    build(): ArbitrationDecisionReadModel {
        if (!this.model.decisionId || !this.model.conflictId) {
            throw new Error('ArbitrationDecisionReadModel requires decisionId and conflictId');
        }

        return {
            decisionId: this.model.decisionId,
            conflictId: this.model.conflictId,
            winningAgent: this.model.winningAgent ?? null,
            winningActionSummary: this.model.winningActionSummary ?? null,
            suppressedAgents: this.model.suppressedAgents ?? [],
            strategyUsed: this.model.strategyUsed ?? 'priority',
            reasoningSummary: this.model.reasoningSummary ?? '',
            escalated: this.model.escalated ?? false,
            executed: this.model.executed ?? false,
            resolvedAt: this.model.resolvedAt ?? new Date(),
            executedAt: this.model.executedAt,
        };
    }
}
