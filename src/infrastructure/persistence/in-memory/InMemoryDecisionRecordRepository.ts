/**
 * InMemoryDecisionRecordRepository - In-memory implementation for testing.
 */

import {
    IDecisionRecordRepository,
    DecisionRecordQuery,
    DecisionStats,
    AgentPerformanceMetrics,
} from '../../../application/ports/IDecisionRecordRepository.js';
import { IDecisionRecord, IDecisionOutcome, DecisionType } from '../../../domain/entities/DecisionRecord.js';
import { ReasoningSource } from '../../../domain/entities/AgentActionLog.js';

export class InMemoryDecisionRecordRepository implements IDecisionRecordRepository {
    private records: Map<string, IDecisionRecord> = new Map();

    async save(record: IDecisionRecord): Promise<void> {
        this.records.set(record.id, { ...record });
    }

    async findById(id: string): Promise<IDecisionRecord | null> {
        return this.records.get(id) ?? null;
    }

    async query(params: DecisionRecordQuery): Promise<IDecisionRecord[]> {
        let results = Array.from(this.records.values());

        // Apply filters
        if (params.agentName) {
            results = results.filter(r => r.agentName === params.agentName);
        }
        if (params.dateRange) {
            results = results.filter(r =>
                r.timestamp >= params.dateRange!.from &&
                r.timestamp <= params.dateRange!.to
            );
        }
        if (params.aggregateType) {
            results = results.filter(r => r.aggregateType === params.aggregateType);
        }
        if (params.aggregateId) {
            results = results.filter(r => r.aggregateId === params.aggregateId);
        }
        if (params.reasoningSource) {
            results = results.filter(r => r.reasoningSource === params.reasoningSource);
        }
        if (params.decisionType) {
            results = results.filter(r => r.decisionType === params.decisionType);
        }
        if (params.hasOutcome !== undefined) {
            results = results.filter(r => (r.outcome !== undefined) === params.hasOutcome);
        }

        // Sort by timestamp descending
        results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        // Apply pagination
        if (params.offset) {
            results = results.slice(params.offset);
        }
        if (params.limit) {
            results = results.slice(0, params.limit);
        }

        return results;
    }

    async count(params: DecisionRecordQuery): Promise<number> {
        const results = await this.query({ ...params, limit: undefined, offset: undefined });
        return results.length;
    }

    async recordOutcome(decisionId: string, outcome: IDecisionOutcome): Promise<void> {
        const record = this.records.get(decisionId);
        if (record) {
            record.outcome = outcome;
            this.records.set(decisionId, record);
        }
    }

    async getStats(dateRange: { from: Date; to: Date }): Promise<DecisionStats> {
        const records = await this.query({ dateRange });

        const byReasoningSource: Record<ReasoningSource, number> = {
            rule: 0,
            llm: 0,
            heuristic: 0,
            fallback: 0,
        };

        const byDecisionType: Record<DecisionType, number> = {
            suggestion: 0,
            reschedule: 0,
            goal_adjustment: 0,
            notification: 0,
            task_creation: 0,
            activity_log: 0,
        };

        const byAgent: Record<string, number> = {};
        let totalAICost = 0;
        let totalLatency = 0;
        let latencyCount = 0;
        let acceptedCount = 0;
        let outcomeCount = 0;

        for (const record of records) {
            byReasoningSource[record.reasoningSource]++;
            byDecisionType[record.decisionType]++;
            byAgent[record.agentName] = (byAgent[record.agentName] ?? 0) + 1;

            if (record.aiMetadata) {
                totalAICost += record.aiMetadata.costUsd;
                totalLatency += record.aiMetadata.latencyMs;
                latencyCount++;
            }

            if (record.outcome) {
                outcomeCount++;
                if (record.outcome.userAccepted === true) {
                    acceptedCount++;
                }
            }
        }

        return {
            totalDecisions: records.length,
            byReasoningSource,
            byDecisionType,
            byAgent,
            totalAICost,
            averageLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0,
            acceptanceRate: outcomeCount > 0 ? acceptedCount / outcomeCount : null,
        };
    }

    async getAgentMetrics(
        agentName: string,
        dateRange?: { from: Date; to: Date }
    ): Promise<AgentPerformanceMetrics> {
        const records = await this.query({ agentName, dateRange });

        let aiDecisions = 0;
        let ruleBasedDecisions = 0;
        let fallbackDecisions = 0;
        let totalConfidence = 0;
        let confidenceCount = 0;
        let totalLatency = 0;
        let latencyCount = 0;
        let totalCost = 0;
        let acceptedCount = 0;
        let outcomeCount = 0;

        for (const record of records) {
            if (record.reasoningSource === 'llm') {
                aiDecisions++;
            } else if (record.reasoningSource === 'fallback') {
                fallbackDecisions++;
            } else {
                ruleBasedDecisions++;
            }

            if (record.aiMetadata) {
                totalConfidence += record.aiMetadata.confidence;
                confidenceCount++;
                totalLatency += record.aiMetadata.latencyMs;
                latencyCount++;
                totalCost += record.aiMetadata.costUsd;
            }

            if (record.outcome) {
                outcomeCount++;
                if (record.outcome.userAccepted === true) {
                    acceptedCount++;
                }
            }
        }

        return {
            agentName,
            totalDecisions: records.length,
            aiDecisions,
            ruleBasedDecisions,
            fallbackDecisions,
            averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
            averageLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0,
            totalCostUsd: totalCost,
            acceptanceRate: outcomeCount > 0 ? acceptedCount / outcomeCount : null,
            decisionsWithOutcome: outcomeCount,
        };
    }

    async getTotalCost(dateRange: { from: Date; to: Date }): Promise<number> {
        const records = await this.query({ dateRange });
        return records.reduce((sum, r) => sum + (r.aiMetadata?.costUsd ?? 0), 0);
    }

    async getAcceptanceRate(agentName: string): Promise<number | null> {
        const metrics = await this.getAgentMetrics(agentName);
        return metrics.acceptanceRate;
    }

    /**
     * Clear all records (for testing).
     */
    clear(): void {
        this.records.clear();
    }

    /**
     * Get all records (for testing).
     */
    getAll(): IDecisionRecord[] {
        return Array.from(this.records.values());
    }
}
