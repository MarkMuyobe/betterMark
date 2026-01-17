/**
 * AnalyticsService - Aggregation and reporting for agent decisions.
 *
 * Provides:
 * - Agent performance reports
 * - System health summaries
 * - Cost tracking and budgeting
 * - Acceptance rate analytics
 */

import {
    IDecisionRecordRepository,
    DecisionStats,
    AgentPerformanceMetrics,
} from '../ports/IDecisionRecordRepository.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import { ReasoningSource } from '../../domain/entities/AgentActionLog.js';
import { DecisionType } from '../../domain/entities/DecisionRecord.js';

/**
 * Time period for reports.
 */
export type ReportPeriod = 'day' | 'week' | 'month' | 'custom';

/**
 * System health report.
 */
export interface SystemHealthReport {
    period: { from: Date; to: Date };
    totalDecisions: number;
    totalAgents: number;
    totalAICost: number;
    averageLatencyMs: number;
    overallAcceptanceRate: number | null;
    topPerformingAgent: string | null;
    mostActiveAgent: string | null;
    aiVsRuleRatio: number; // AI decisions / total decisions
    conflictCount: number;
    healthScore: number; // 0-100 based on various factors
}

/**
 * Cost breakdown report.
 */
export interface CostReport {
    period: { from: Date; to: Date };
    totalCost: number;
    costByAgent: Record<string, number>;
    costByDecisionType: Record<DecisionType, number>;
    averageCostPerDecision: number;
    projectedMonthlyCost: number;
    budgetUtilization: number | null; // percentage if budget is set
}

/**
 * Trend data point.
 */
export interface TrendPoint {
    date: Date;
    value: number;
}

/**
 * Trend report for time-series analysis.
 */
export interface TrendReport {
    metric: string;
    period: { from: Date; to: Date };
    dataPoints: TrendPoint[];
    trend: 'increasing' | 'decreasing' | 'stable';
    changePercent: number;
}

export class AnalyticsService {
    constructor(
        private readonly decisionRepository: IDecisionRecordRepository,
        private readonly observability?: IObservabilityContext,
        private readonly monthlyBudgetUsd?: number
    ) {}

    /**
     * Get date range for a period.
     */
    private getDateRange(period: ReportPeriod, customRange?: { from: Date; to: Date }): { from: Date; to: Date } {
        if (period === 'custom' && customRange) {
            return customRange;
        }

        const to = new Date();
        const from = new Date();

        switch (period) {
            case 'day':
                from.setDate(from.getDate() - 1);
                break;
            case 'week':
                from.setDate(from.getDate() - 7);
                break;
            case 'month':
                from.setMonth(from.getMonth() - 1);
                break;
            default:
                from.setDate(from.getDate() - 7); // Default to week
        }

        return { from, to };
    }

    /**
     * Get system health report.
     */
    async getSystemHealthReport(
        period: ReportPeriod = 'week',
        customRange?: { from: Date; to: Date }
    ): Promise<SystemHealthReport> {
        const span = this.observability?.tracer?.startSpan('analytics.systemHealthReport');

        try {
            const dateRange = this.getDateRange(period, customRange);
            const stats = await this.decisionRepository.getStats(dateRange);

            // Calculate metrics
            const agentNames = Object.keys(stats.byAgent);
            const totalAgents = agentNames.length;

            // Find top performing agent (by acceptance rate)
            let topPerformingAgent: string | null = null;
            let bestAcceptanceRate = -1;

            // Find most active agent
            let mostActiveAgent: string | null = null;
            let maxDecisions = 0;

            for (const agentName of agentNames) {
                const metrics = await this.decisionRepository.getAgentMetrics(agentName, dateRange);

                if (metrics.acceptanceRate !== null && metrics.acceptanceRate > bestAcceptanceRate) {
                    bestAcceptanceRate = metrics.acceptanceRate;
                    topPerformingAgent = agentName;
                }

                if (metrics.totalDecisions > maxDecisions) {
                    maxDecisions = metrics.totalDecisions;
                    mostActiveAgent = agentName;
                }
            }

            // Calculate AI vs rule ratio
            const aiDecisions = stats.byReasoningSource.llm ?? 0;
            const aiVsRuleRatio = stats.totalDecisions > 0
                ? aiDecisions / stats.totalDecisions
                : 0;

            // Calculate health score (0-100)
            const healthScore = this.calculateHealthScore(stats, bestAcceptanceRate);

            // Get conflict count (approximated by fallback decisions)
            const conflictCount = stats.byReasoningSource.fallback ?? 0;

            const report: SystemHealthReport = {
                period: dateRange,
                totalDecisions: stats.totalDecisions,
                totalAgents,
                totalAICost: stats.totalAICost,
                averageLatencyMs: stats.averageLatencyMs,
                overallAcceptanceRate: stats.acceptanceRate,
                topPerformingAgent,
                mostActiveAgent,
                aiVsRuleRatio,
                conflictCount,
                healthScore,
            };

            this.observability?.metrics?.incrementCounter('analytics.reports.generated', 1, { type: 'system_health' });
            span?.end();

            return report;
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Calculate health score based on various factors.
     */
    private calculateHealthScore(stats: DecisionStats, bestAcceptanceRate: number): number {
        let score = 100;

        // Penalize high fallback rate
        const fallbackRate = stats.totalDecisions > 0
            ? (stats.byReasoningSource.fallback ?? 0) / stats.totalDecisions
            : 0;
        score -= fallbackRate * 30; // Up to -30 for high fallback

        // Penalize low acceptance rate
        if (stats.acceptanceRate !== null) {
            score -= (1 - stats.acceptanceRate) * 20; // Up to -20 for low acceptance
        }

        // Penalize high latency (over 2000ms is bad)
        if (stats.averageLatencyMs > 2000) {
            score -= Math.min(20, (stats.averageLatencyMs - 2000) / 100);
        }

        // Bonus for having diverse agents
        const agentCount = Object.keys(stats.byAgent).length;
        if (agentCount >= 3) {
            score += 5;
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * Get cost breakdown report.
     */
    async getCostReport(
        period: ReportPeriod = 'month',
        customRange?: { from: Date; to: Date }
    ): Promise<CostReport> {
        const span = this.observability?.tracer?.startSpan('analytics.costReport');

        try {
            const dateRange = this.getDateRange(period, customRange);
            const stats = await this.decisionRepository.getStats(dateRange);

            // Get cost by agent
            const costByAgent: Record<string, number> = {};
            for (const agentName of Object.keys(stats.byAgent)) {
                const metrics = await this.decisionRepository.getAgentMetrics(agentName, dateRange);
                costByAgent[agentName] = metrics.totalCostUsd;
            }

            // Calculate cost by decision type (approximation based on AI decisions)
            const costByDecisionType: Record<DecisionType, number> = {
                suggestion: 0,
                reschedule: 0,
                goal_adjustment: 0,
                notification: 0,
                task_creation: 0,
                activity_log: 0,
            };

            // Query decisions and aggregate costs
            const decisions = await this.decisionRepository.query({ dateRange });
            for (const decision of decisions) {
                if (decision.aiMetadata) {
                    costByDecisionType[decision.decisionType] += decision.aiMetadata.costUsd;
                }
            }

            // Calculate averages and projections
            const averageCostPerDecision = stats.totalDecisions > 0
                ? stats.totalAICost / stats.totalDecisions
                : 0;

            // Project monthly cost based on current rate
            const daysInPeriod = Math.max(1,
                (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)
            );
            const dailyRate = stats.totalAICost / daysInPeriod;
            const projectedMonthlyCost = dailyRate * 30;

            // Calculate budget utilization
            const budgetUtilization = this.monthlyBudgetUsd
                ? (projectedMonthlyCost / this.monthlyBudgetUsd) * 100
                : null;

            const report: CostReport = {
                period: dateRange,
                totalCost: stats.totalAICost,
                costByAgent,
                costByDecisionType,
                averageCostPerDecision,
                projectedMonthlyCost,
                budgetUtilization,
            };

            this.observability?.metrics?.incrementCounter('analytics.reports.generated', 1, { type: 'cost' });
            span?.end();

            return report;
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Get agent performance report.
     */
    async getAgentPerformanceReport(
        agentName: string,
        period: ReportPeriod = 'week',
        customRange?: { from: Date; to: Date }
    ): Promise<AgentPerformanceMetrics> {
        const span = this.observability?.tracer?.startSpan('analytics.agentPerformanceReport');

        try {
            const dateRange = this.getDateRange(period, customRange);
            const metrics = await this.decisionRepository.getAgentMetrics(agentName, dateRange);

            this.observability?.metrics?.incrementCounter('analytics.reports.generated', 1, {
                type: 'agent_performance',
                agent: agentName
            });
            span?.end();

            return metrics;
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Get all agents' performance comparison.
     */
    async getAgentComparisonReport(
        period: ReportPeriod = 'week',
        customRange?: { from: Date; to: Date }
    ): Promise<AgentPerformanceMetrics[]> {
        const span = this.observability?.tracer?.startSpan('analytics.agentComparisonReport');

        try {
            const dateRange = this.getDateRange(period, customRange);
            const stats = await this.decisionRepository.getStats(dateRange);

            const reports: AgentPerformanceMetrics[] = [];
            for (const agentName of Object.keys(stats.byAgent)) {
                const metrics = await this.decisionRepository.getAgentMetrics(agentName, dateRange);
                reports.push(metrics);
            }

            // Sort by total decisions descending
            reports.sort((a, b) => b.totalDecisions - a.totalDecisions);

            this.observability?.metrics?.incrementCounter('analytics.reports.generated', 1, { type: 'agent_comparison' });
            span?.end();

            return reports;
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Get trend report for a specific metric.
     */
    async getTrendReport(
        metric: 'decisions' | 'cost' | 'latency' | 'acceptance',
        period: ReportPeriod = 'week',
        customRange?: { from: Date; to: Date }
    ): Promise<TrendReport> {
        const span = this.observability?.tracer?.startSpan('analytics.trendReport');

        try {
            const dateRange = this.getDateRange(period, customRange);

            // Divide period into daily buckets
            const dataPoints: TrendPoint[] = [];
            const current = new Date(dateRange.from);

            while (current <= dateRange.to) {
                const dayStart = new Date(current);
                dayStart.setHours(0, 0, 0, 0);

                const dayEnd = new Date(current);
                dayEnd.setHours(23, 59, 59, 999);

                const dayRange = { from: dayStart, to: dayEnd };
                const stats = await this.decisionRepository.getStats(dayRange);

                let value: number;
                switch (metric) {
                    case 'decisions':
                        value = stats.totalDecisions;
                        break;
                    case 'cost':
                        value = stats.totalAICost;
                        break;
                    case 'latency':
                        value = stats.averageLatencyMs;
                        break;
                    case 'acceptance':
                        value = stats.acceptanceRate ?? 0;
                        break;
                }

                dataPoints.push({ date: new Date(dayStart), value });
                current.setDate(current.getDate() + 1);
            }

            // Calculate trend
            const { trend, changePercent } = this.calculateTrend(dataPoints);

            const report: TrendReport = {
                metric,
                period: dateRange,
                dataPoints,
                trend,
                changePercent,
            };

            this.observability?.metrics?.incrementCounter('analytics.reports.generated', 1, { type: 'trend', metric });
            span?.end();

            return report;
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Calculate trend from data points.
     */
    private calculateTrend(dataPoints: TrendPoint[]): {
        trend: 'increasing' | 'decreasing' | 'stable';
        changePercent: number
    } {
        if (dataPoints.length < 2) {
            return { trend: 'stable', changePercent: 0 };
        }

        // Compare first half average to second half average
        const midpoint = Math.floor(dataPoints.length / 2);
        const firstHalf = dataPoints.slice(0, midpoint);
        const secondHalf = dataPoints.slice(midpoint);

        const firstAvg = firstHalf.reduce((sum, p) => sum + p.value, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, p) => sum + p.value, 0) / secondHalf.length;

        if (firstAvg === 0) {
            return {
                trend: secondAvg > 0 ? 'increasing' : 'stable',
                changePercent: secondAvg > 0 ? 100 : 0
            };
        }

        const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

        let trend: 'increasing' | 'decreasing' | 'stable';
        if (changePercent > 10) {
            trend = 'increasing';
        } else if (changePercent < -10) {
            trend = 'decreasing';
        } else {
            trend = 'stable';
        }

        return { trend, changePercent: Math.round(changePercent * 100) / 100 };
    }

    /**
     * Check if cost is approaching budget threshold.
     */
    async checkBudgetAlert(thresholdPercent: number = 80): Promise<{
        isOverThreshold: boolean;
        currentUtilization: number;
        projectedMonthEnd: number;
    } | null> {
        if (!this.monthlyBudgetUsd) {
            return null;
        }

        const costReport = await this.getCostReport('month');
        const isOverThreshold = (costReport.budgetUtilization ?? 0) >= thresholdPercent;

        return {
            isOverThreshold,
            currentUtilization: costReport.budgetUtilization ?? 0,
            projectedMonthEnd: costReport.projectedMonthlyCost,
        };
    }
}
