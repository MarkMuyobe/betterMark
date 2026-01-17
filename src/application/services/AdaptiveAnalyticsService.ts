/**
 * AdaptiveAnalyticsService - V9 analytics for adaptive agent behavior.
 *
 * Tracks:
 * - Preference suggestion trends
 * - Suggestion adoption rates
 * - Impact of preference changes on acceptance rates
 * - Learning effectiveness metrics
 */

import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { IDecisionRecordRepository } from '../ports/IDecisionRecordRepository.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import { ISuggestedPreference, IPreferenceChangeRecord } from '../../domain/entities/AgentLearningProfile.js';

/**
 * Suggestion adoption report.
 */
export interface SuggestionAdoptionReport {
    agentName: string;
    totalSuggestions: number;
    pendingSuggestions: number;
    approvedSuggestions: number;
    rejectedSuggestions: number;
    adoptionRate: number | null; // approved / (approved + rejected)
    averageConfidence: number;
    topSuggestedCategories: Array<{ category: string; count: number }>;
}

/**
 * Preference change impact report.
 */
export interface PreferenceImpactReport {
    agentName: string;
    category: string;
    key: string;
    previousValue: unknown;
    newValue: unknown;
    changedAt: Date;
    acceptanceRateBefore: number | null;
    acceptanceRateAfter: number | null;
    impactScore: number; // Positive = improvement, negative = degradation
    sampleSizeBefore: number;
    sampleSizeAfter: number;
}

/**
 * Learning effectiveness summary.
 */
export interface LearningEffectivenessSummary {
    agentName: string;
    totalFeedbackProcessed: number;
    suggestionsGenerated: number;
    suggestionsAdopted: number;
    preferenceChanges: number;
    overallImprovementScore: number; // Aggregate measure of learning success
    recommendedActions: string[];
}

/**
 * System-wide adaptive learning report.
 */
export interface AdaptiveLearningReport {
    period: { from: Date; to: Date };
    agentSummaries: LearningEffectivenessSummary[];
    totalSuggestionsCreated: number;
    totalSuggestionsAdopted: number;
    systemWideAdoptionRate: number | null;
    topPerformingAgent: string | null;
    agentsNeedingAttention: string[];
}

export class AdaptiveAnalyticsService {
    constructor(
        private readonly learningRepository: IAgentLearningRepository,
        private readonly decisionRepository: IDecisionRecordRepository,
        private readonly observability?: IObservabilityContext
    ) {}

    /**
     * Get suggestion adoption report for an agent.
     */
    async getSuggestionAdoptionReport(agentName: string): Promise<SuggestionAdoptionReport> {
        const span = this.observability?.tracer?.startSpan('adaptive.suggestionAdoptionReport');

        try {
            const profile = await this.learningRepository.findByAgentName(agentName);

            if (!profile) {
                span?.end();
                return {
                    agentName,
                    totalSuggestions: 0,
                    pendingSuggestions: 0,
                    approvedSuggestions: 0,
                    rejectedSuggestions: 0,
                    adoptionRate: null,
                    averageConfidence: 0,
                    topSuggestedCategories: [],
                };
            }

            const suggestions = profile.suggestedPreferences;
            const pending = suggestions.filter(s => s.status === 'pending').length;
            const approved = suggestions.filter(s => s.status === 'approved').length;
            const rejected = suggestions.filter(s => s.status === 'rejected').length;
            const decided = approved + rejected;

            // Calculate average confidence
            const totalConfidence = suggestions.reduce((sum, s) => sum + s.confidence, 0);
            const averageConfidence = suggestions.length > 0 ? totalConfidence / suggestions.length : 0;

            // Count by category
            const categoryCount = new Map<string, number>();
            for (const suggestion of suggestions) {
                categoryCount.set(
                    suggestion.category,
                    (categoryCount.get(suggestion.category) ?? 0) + 1
                );
            }

            const topSuggestedCategories = Array.from(categoryCount.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            this.observability?.metrics?.incrementCounter('adaptive.reports.generated', 1, {
                type: 'suggestion_adoption',
                agent: agentName,
            });

            span?.end();

            return {
                agentName,
                totalSuggestions: suggestions.length,
                pendingSuggestions: pending,
                approvedSuggestions: approved,
                rejectedSuggestions: rejected,
                adoptionRate: decided > 0 ? approved / decided : null,
                averageConfidence,
                topSuggestedCategories,
            };
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Analyze impact of a preference change on acceptance rate.
     */
    async analyzePreferenceImpact(
        agentName: string,
        changeId: string
    ): Promise<PreferenceImpactReport | null> {
        const span = this.observability?.tracer?.startSpan('adaptive.preferenceImpact');

        try {
            const history = await this.learningRepository.getPreferenceHistory(agentName);
            const change = history.find(c => c.changeId === changeId);

            if (!change) {
                span?.end();
                return null;
            }

            // Get decisions before and after the change
            const beforeRange = {
                from: new Date(change.changedAt.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days before
                to: change.changedAt,
            };
            const afterRange = {
                from: change.changedAt,
                to: new Date(change.changedAt.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days after
            };

            const decisionsBefore = await this.decisionRepository.query({
                agentName,
                dateRange: beforeRange,
                hasOutcome: true,
            });

            const decisionsAfter = await this.decisionRepository.query({
                agentName,
                dateRange: afterRange,
                hasOutcome: true,
            });

            // Calculate acceptance rates
            const acceptedBefore = decisionsBefore.filter(d => d.outcome?.userAccepted === true).length;
            const acceptedAfter = decisionsAfter.filter(d => d.outcome?.userAccepted === true).length;

            const acceptanceRateBefore = decisionsBefore.length > 0
                ? acceptedBefore / decisionsBefore.length
                : null;
            const acceptanceRateAfter = decisionsAfter.length > 0
                ? acceptedAfter / decisionsAfter.length
                : null;

            // Calculate impact score
            let impactScore = 0;
            if (acceptanceRateBefore !== null && acceptanceRateAfter !== null) {
                impactScore = (acceptanceRateAfter - acceptanceRateBefore) * 100;
            }

            this.observability?.metrics?.incrementCounter('adaptive.reports.generated', 1, {
                type: 'preference_impact',
                agent: agentName,
            });

            span?.end();

            return {
                agentName,
                category: change.category,
                key: change.key,
                previousValue: change.previousValue,
                newValue: change.newValue,
                changedAt: change.changedAt,
                acceptanceRateBefore,
                acceptanceRateAfter,
                impactScore,
                sampleSizeBefore: decisionsBefore.length,
                sampleSizeAfter: decisionsAfter.length,
            };
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Get learning effectiveness summary for an agent.
     */
    async getLearningEffectivenessSummary(agentName: string): Promise<LearningEffectivenessSummary> {
        const span = this.observability?.tracer?.startSpan('adaptive.learningEffectiveness');

        try {
            const profile = await this.learningRepository.findByAgentName(agentName);

            if (!profile) {
                span?.end();
                return {
                    agentName,
                    totalFeedbackProcessed: 0,
                    suggestionsGenerated: 0,
                    suggestionsAdopted: 0,
                    preferenceChanges: 0,
                    overallImprovementScore: 0,
                    recommendedActions: ['Enable learning to start collecting feedback'],
                };
            }

            const adoptionReport = await this.getSuggestionAdoptionReport(agentName);

            // Calculate overall improvement score
            let improvementScore = 0;

            // Factor 1: High adoption rate is good (max 30 points)
            if (adoptionReport.adoptionRate !== null) {
                improvementScore += adoptionReport.adoptionRate * 30;
            }

            // Factor 2: Having suggestions means system is learning (max 20 points)
            if (adoptionReport.totalSuggestions > 0) {
                improvementScore += Math.min(20, adoptionReport.totalSuggestions * 2);
            }

            // Factor 3: Good acceptance rate overall (max 50 points)
            if (profile.overallAcceptanceRate !== null) {
                improvementScore += profile.overallAcceptanceRate * 50;
            }

            // Generate recommended actions
            const recommendedActions: string[] = [];

            if (profile.totalFeedbackReceived < 10) {
                recommendedActions.push('Collect more feedback to enable meaningful analysis');
            }

            if (adoptionReport.pendingSuggestions > 0) {
                recommendedActions.push(`Review ${adoptionReport.pendingSuggestions} pending preference suggestions`);
            }

            if (profile.overallAcceptanceRate !== null && profile.overallAcceptanceRate < 0.5) {
                recommendedActions.push('Low acceptance rate - consider adjusting agent preferences');
            }

            if (adoptionReport.adoptionRate !== null && adoptionReport.adoptionRate < 0.3) {
                recommendedActions.push('Low suggestion adoption - review if suggestions are relevant');
            }

            if (recommendedActions.length === 0) {
                recommendedActions.push('Agent is performing well - continue monitoring');
            }

            this.observability?.metrics?.incrementCounter('adaptive.reports.generated', 1, {
                type: 'learning_effectiveness',
                agent: agentName,
            });

            span?.end();

            return {
                agentName,
                totalFeedbackProcessed: profile.totalFeedbackReceived,
                suggestionsGenerated: adoptionReport.totalSuggestions,
                suggestionsAdopted: adoptionReport.approvedSuggestions,
                preferenceChanges: profile.preferenceChangeHistory.length,
                overallImprovementScore: Math.round(improvementScore),
                recommendedActions,
            };
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Get system-wide adaptive learning report.
     */
    async getAdaptiveLearningReport(
        period: { from: Date; to: Date }
    ): Promise<AdaptiveLearningReport> {
        const span = this.observability?.tracer?.startSpan('adaptive.systemReport');

        try {
            // Get all profiles
            const profiles = await this.learningRepository.query({});

            const agentSummaries: LearningEffectivenessSummary[] = [];
            let totalSuggestionsCreated = 0;
            let totalSuggestionsAdopted = 0;
            let topPerformingAgent: string | null = null;
            let topScore = -1;
            const agentsNeedingAttention: string[] = [];

            for (const profile of profiles) {
                const summary = await this.getLearningEffectivenessSummary(profile.agentName);
                agentSummaries.push(summary);

                totalSuggestionsCreated += summary.suggestionsGenerated;
                totalSuggestionsAdopted += summary.suggestionsAdopted;

                if (summary.overallImprovementScore > topScore) {
                    topScore = summary.overallImprovementScore;
                    topPerformingAgent = profile.agentName;
                }

                // Flag agents needing attention
                if (
                    summary.overallImprovementScore < 50 ||
                    (profile.overallAcceptanceRate !== null && profile.overallAcceptanceRate < 0.4)
                ) {
                    agentsNeedingAttention.push(profile.agentName);
                }
            }

            const decidedSuggestions = totalSuggestionsCreated > 0
                ? totalSuggestionsAdopted + (totalSuggestionsCreated - totalSuggestionsAdopted)
                : 0;
            const systemWideAdoptionRate = decidedSuggestions > 0
                ? totalSuggestionsAdopted / decidedSuggestions
                : null;

            this.observability?.metrics?.incrementCounter('adaptive.reports.generated', 1, {
                type: 'system_report',
            });

            span?.end();

            return {
                period,
                agentSummaries,
                totalSuggestionsCreated,
                totalSuggestionsAdopted,
                systemWideAdoptionRate,
                topPerformingAgent,
                agentsNeedingAttention,
            };
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Get trend of suggestions over time.
     */
    async getSuggestionTrend(
        agentName: string,
        period: { from: Date; to: Date }
    ): Promise<{
        totalCreated: number;
        totalApproved: number;
        totalRejected: number;
        createdByWeek: Array<{ week: Date; count: number }>;
        adoptionTrend: 'improving' | 'declining' | 'stable';
    }> {
        const profile = await this.learningRepository.findByAgentName(agentName);

        if (!profile) {
            return {
                totalCreated: 0,
                totalApproved: 0,
                totalRejected: 0,
                createdByWeek: [],
                adoptionTrend: 'stable',
            };
        }

        const suggestions = profile.suggestedPreferences.filter(
            s => s.suggestedAt >= period.from && s.suggestedAt <= period.to
        );

        const totalCreated = suggestions.length;
        const totalApproved = suggestions.filter(s => s.status === 'approved').length;
        const totalRejected = suggestions.filter(s => s.status === 'rejected').length;

        // Group by week
        const weekBuckets = new Map<string, number>();
        for (const suggestion of suggestions) {
            const weekStart = new Date(suggestion.suggestedAt);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            const key = weekStart.toISOString();
            weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + 1);
        }

        const createdByWeek = Array.from(weekBuckets.entries())
            .map(([week, count]) => ({ week: new Date(week), count }))
            .sort((a, b) => a.week.getTime() - b.week.getTime());

        // Determine adoption trend
        let adoptionTrend: 'improving' | 'declining' | 'stable' = 'stable';
        if (createdByWeek.length >= 2) {
            const firstHalf = suggestions.slice(0, Math.floor(suggestions.length / 2));
            const secondHalf = suggestions.slice(Math.floor(suggestions.length / 2));

            const firstAdoption = firstHalf.filter(s => s.status === 'approved').length / Math.max(1, firstHalf.length);
            const secondAdoption = secondHalf.filter(s => s.status === 'approved').length / Math.max(1, secondHalf.length);

            if (secondAdoption > firstAdoption + 0.1) {
                adoptionTrend = 'improving';
            } else if (secondAdoption < firstAdoption - 0.1) {
                adoptionTrend = 'declining';
            }
        }

        return {
            totalCreated,
            totalApproved,
            totalRejected,
            createdByWeek,
            adoptionTrend,
        };
    }
}
