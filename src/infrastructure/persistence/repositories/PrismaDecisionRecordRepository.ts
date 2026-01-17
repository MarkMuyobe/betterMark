/**
 * PrismaDecisionRecordRepository - Prisma implementation for decision records.
 */

import { prisma } from '../prisma/client.js';
import {
    IDecisionRecordRepository,
    DecisionRecordQuery,
    DecisionStats,
    AgentPerformanceMetrics,
} from '../../../application/ports/IDecisionRecordRepository.js';
import { IDecisionRecord, IDecisionOutcome, DecisionType } from '../../../domain/entities/DecisionRecord.js';
import { ReasoningSource } from '../../../domain/entities/AgentActionLog.js';

export class PrismaDecisionRecordRepository implements IDecisionRecordRepository {
    async save(record: IDecisionRecord): Promise<void> {
        await prisma.decisionRecord.create({
            data: {
                id: record.id,
                timestamp: record.timestamp,
                triggeringEventType: record.triggeringEventType,
                triggeringEventId: record.triggeringEventId,
                aggregateType: record.aggregateType,
                aggregateId: record.aggregateId,
                agentName: record.agentName,
                decisionType: record.decisionType,
                reasoningSource: record.reasoningSource,
                decisionContent: record.decisionContent,
                aiModel: record.aiMetadata?.model ?? null,
                aiConfidence: record.aiMetadata?.confidence ?? null,
                aiPromptTokens: record.aiMetadata?.promptTokens ?? null,
                aiCompletionTokens: record.aiMetadata?.completionTokens ?? null,
                aiCostUsd: record.aiMetadata?.costUsd ?? null,
                aiLatencyMs: record.aiMetadata?.latencyMs ?? null,
                outcomeUserAccepted: record.outcome?.userAccepted ?? null,
                outcomeUserFeedback: record.outcome?.userFeedback ?? null,
                outcomeActualResult: record.outcome?.actualResult ?? null,
                outcomeRecordedAt: record.outcome?.recordedAt ?? null,
            },
        });
    }

    async findById(id: string): Promise<IDecisionRecord | null> {
        const row = await prisma.decisionRecord.findUnique({
            where: { id },
        });

        if (!row) return null;
        return this.mapToEntity(row);
    }

    async query(params: DecisionRecordQuery): Promise<IDecisionRecord[]> {
        const where = this.buildWhereClause(params);

        const rows = await prisma.decisionRecord.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            skip: params.offset,
            take: params.limit,
        });

        return rows.map(row => this.mapToEntity(row));
    }

    async count(params: DecisionRecordQuery): Promise<number> {
        const where = this.buildWhereClause(params);
        return prisma.decisionRecord.count({ where });
    }

    async recordOutcome(decisionId: string, outcome: IDecisionOutcome): Promise<void> {
        await prisma.decisionRecord.update({
            where: { id: decisionId },
            data: {
                outcomeUserAccepted: outcome.userAccepted,
                outcomeUserFeedback: outcome.userFeedback ?? null,
                outcomeActualResult: outcome.actualResult ?? null,
                outcomeRecordedAt: outcome.recordedAt,
            },
        });
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

    private buildWhereClause(params: DecisionRecordQuery): Record<string, unknown> {
        const where: Record<string, unknown> = {};

        if (params.agentName) {
            where.agentName = params.agentName;
        }
        if (params.dateRange) {
            where.timestamp = {
                gte: params.dateRange.from,
                lte: params.dateRange.to,
            };
        }
        if (params.aggregateType) {
            where.aggregateType = params.aggregateType;
        }
        if (params.aggregateId) {
            where.aggregateId = params.aggregateId;
        }
        if (params.reasoningSource) {
            where.reasoningSource = params.reasoningSource;
        }
        if (params.decisionType) {
            where.decisionType = params.decisionType;
        }
        if (params.hasOutcome !== undefined) {
            where.outcomeRecordedAt = params.hasOutcome ? { not: null } : null;
        }

        return where;
    }

    private mapToEntity(row: {
        id: string;
        timestamp: Date;
        triggeringEventType: string;
        triggeringEventId: string;
        aggregateType: string;
        aggregateId: string;
        agentName: string;
        decisionType: string;
        reasoningSource: string;
        decisionContent: string;
        aiModel: string | null;
        aiConfidence: number | null;
        aiPromptTokens: number | null;
        aiCompletionTokens: number | null;
        aiCostUsd: number | null;
        aiLatencyMs: number | null;
        outcomeUserAccepted: boolean | null;
        outcomeUserFeedback: string | null;
        outcomeActualResult: string | null;
        outcomeRecordedAt: Date | null;
    }): IDecisionRecord {
        const record: IDecisionRecord = {
            id: row.id,
            timestamp: row.timestamp,
            triggeringEventType: row.triggeringEventType,
            triggeringEventId: row.triggeringEventId,
            aggregateType: row.aggregateType,
            aggregateId: row.aggregateId,
            agentName: row.agentName,
            decisionType: row.decisionType as DecisionType,
            reasoningSource: row.reasoningSource as ReasoningSource,
            decisionContent: row.decisionContent,
        };

        // Map AI metadata if present
        if (row.aiModel !== null) {
            record.aiMetadata = {
                model: row.aiModel,
                confidence: row.aiConfidence ?? 0,
                promptTokens: row.aiPromptTokens ?? 0,
                completionTokens: row.aiCompletionTokens ?? 0,
                costUsd: row.aiCostUsd ?? 0,
                latencyMs: row.aiLatencyMs ?? 0,
            };
        }

        // Map outcome if present
        if (row.outcomeRecordedAt !== null) {
            record.outcome = {
                userAccepted: row.outcomeUserAccepted,
                userFeedback: row.outcomeUserFeedback ?? undefined,
                actualResult: row.outcomeActualResult ?? undefined,
                recordedAt: row.outcomeRecordedAt,
            };
        }

        return record;
    }
}
