/**
 * IDecisionRecordRepository - Repository interface for decision records.
 *
 * Supports querying for analytics and reporting.
 */

import { IDecisionRecord, IDecisionOutcome, DecisionType } from '../../domain/entities/DecisionRecord.js';
import { ReasoningSource } from '../../domain/entities/AgentActionLog.js';

/**
 * Query parameters for decision records.
 */
export interface DecisionRecordQuery {
    agentName?: string;
    dateRange?: { from: Date; to: Date };
    aggregateType?: string;
    aggregateId?: string;
    reasoningSource?: ReasoningSource;
    decisionType?: DecisionType;
    hasOutcome?: boolean;
    limit?: number;
    offset?: number;
}

/**
 * Aggregated statistics for decisions.
 */
export interface DecisionStats {
    totalDecisions: number;
    byReasoningSource: Record<ReasoningSource, number>;
    byDecisionType: Record<DecisionType, number>;
    byAgent: Record<string, number>;
    totalAICost: number;
    averageLatencyMs: number;
    acceptanceRate: number | null; // null if no outcomes recorded
}

/**
 * Agent-specific performance metrics.
 */
export interface AgentPerformanceMetrics {
    agentName: string;
    totalDecisions: number;
    aiDecisions: number;
    ruleBasedDecisions: number;
    fallbackDecisions: number;
    averageConfidence: number;
    averageLatencyMs: number;
    totalCostUsd: number;
    acceptanceRate: number | null;
    decisionsWithOutcome: number;
}

export interface IDecisionRecordRepository {
    /**
     * Save a decision record.
     */
    save(record: IDecisionRecord): Promise<void>;

    /**
     * Find a decision record by ID.
     */
    findById(id: string): Promise<IDecisionRecord | null>;

    /**
     * Query decision records with filters.
     */
    query(params: DecisionRecordQuery): Promise<IDecisionRecord[]>;

    /**
     * Count decision records matching query.
     */
    count(params: DecisionRecordQuery): Promise<number>;

    /**
     * Record an outcome for a decision.
     */
    recordOutcome(decisionId: string, outcome: IDecisionOutcome): Promise<void>;

    /**
     * Get aggregated statistics for a date range.
     */
    getStats(dateRange: { from: Date; to: Date }): Promise<DecisionStats>;

    /**
     * Get performance metrics for a specific agent.
     */
    getAgentMetrics(agentName: string, dateRange?: { from: Date; to: Date }): Promise<AgentPerformanceMetrics>;

    /**
     * Get total AI cost for a date range.
     */
    getTotalCost(dateRange: { from: Date; to: Date }): Promise<number>;

    /**
     * Get acceptance rate for an agent.
     */
    getAcceptanceRate(agentName: string): Promise<number | null>;
}
