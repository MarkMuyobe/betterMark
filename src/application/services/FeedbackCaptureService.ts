/**
 * FeedbackCaptureService - Captures user feedback on agent decisions.
 *
 * V8: Bridges DecisionRecords to AgentLearningProfiles.
 * V9: Auto-triggers suggestion analysis after feedback thresholds are met.
 */

import { IDecisionRecordRepository } from '../ports/IDecisionRecordRepository.js';
import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { IDecisionOutcome } from '../../domain/entities/DecisionRecord.js';
import { IFeedbackEntry } from '../../domain/entities/AgentLearningProfile.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { PreferenceSuggestionService } from './PreferenceSuggestionService.js';

/**
 * Input for capturing feedback.
 */
export interface CaptureFeedbackInput {
    decisionRecordId: string;
    userAccepted: boolean | null;
    userFeedback?: string;
    actualResult?: string;
    context?: Record<string, unknown>;
}

/**
 * Result of feedback capture.
 */
export interface CaptureFeedbackResult {
    success: boolean;
    decisionRecordId: string;
    feedbackEntryId?: string;
    error?: string;
    /** V9: Number of suggestions triggered by this feedback */
    suggestionsTriggered?: number;
}

/**
 * Bulk feedback input.
 */
export interface BulkFeedbackInput {
    items: CaptureFeedbackInput[];
}

/**
 * Bulk feedback result.
 */
export interface BulkFeedbackResult {
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    results: CaptureFeedbackResult[];
}

/**
 * V9 Configuration for auto-suggestion triggering.
 */
export interface FeedbackCaptureConfig {
    /** Minimum feedback entries before triggering suggestion analysis */
    suggestionThreshold: number;
    /** Whether to auto-trigger suggestion analysis */
    autoTriggerSuggestions: boolean;
}

const DEFAULT_CONFIG: FeedbackCaptureConfig = {
    suggestionThreshold: 10,
    autoTriggerSuggestions: true,
};

export class FeedbackCaptureService {
    private config: FeedbackCaptureConfig;
    private feedbackCountSinceLastAnalysis: Map<string, number> = new Map();

    constructor(
        private readonly decisionRepository: IDecisionRecordRepository,
        private readonly learningRepository: IAgentLearningRepository,
        private readonly observability?: IObservabilityContext,
        private readonly suggestionService?: PreferenceSuggestionService,
        config?: Partial<FeedbackCaptureConfig>
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Capture feedback for a single decision.
     */
    async captureFeedback(input: CaptureFeedbackInput): Promise<CaptureFeedbackResult> {
        const span = this.observability?.tracer?.startSpan('feedback.capture');

        try {
            // 1. Find the decision record
            const decision = await this.decisionRepository.findById(input.decisionRecordId);
            if (!decision) {
                span?.setStatus('error');
                span?.end();
                return {
                    success: false,
                    decisionRecordId: input.decisionRecordId,
                    error: 'Decision record not found',
                };
            }

            // 2. Record outcome on the decision record
            const outcome: IDecisionOutcome = {
                userAccepted: input.userAccepted,
                userFeedback: input.userFeedback,
                actualResult: input.actualResult,
                recordedAt: new Date(),
            };
            await this.decisionRepository.recordOutcome(input.decisionRecordId, outcome);

            // 3. Create feedback entry for learning
            const feedbackEntry: IFeedbackEntry = {
                decisionRecordId: input.decisionRecordId,
                timestamp: new Date(),
                decisionType: decision.decisionType,
                userAccepted: input.userAccepted,
                userFeedback: input.userFeedback,
                context: {
                    ...input.context,
                    aggregateType: decision.aggregateType,
                    aggregateId: decision.aggregateId,
                    reasoningSource: decision.reasoningSource,
                    aiConfidence: decision.aiMetadata?.confidence,
                },
            };

            // 4. Add to learning repository
            await this.learningRepository.addFeedback(decision.agentName, feedbackEntry);

            // 5. V9: Track feedback count and auto-trigger suggestion analysis
            const suggestionsTriggered = await this.maybeTrigggerSuggestionAnalysis(decision.agentName);

            // 6. Log metrics
            this.observability?.metrics?.incrementCounter('feedback.captured', 1, {
                agent: decision.agentName,
                accepted: String(input.userAccepted),
            });

            this.observability?.logger?.info('Feedback captured', {
                decisionRecordId: input.decisionRecordId,
                agentName: decision.agentName,
                userAccepted: input.userAccepted,
                suggestionsTriggered,
            });

            span?.end();

            return {
                success: true,
                decisionRecordId: input.decisionRecordId,
                feedbackEntryId: IdGenerator.generate(),
                suggestionsTriggered, // V9: Include whether suggestions were triggered
            } as CaptureFeedbackResult;
        } catch (error) {
            span?.setStatus('error');
            span?.end();

            this.observability?.logger?.error(
                'Failed to capture feedback',
                error instanceof Error ? error : undefined,
                { decisionRecordId: input.decisionRecordId }
            );

            return {
                success: false,
                decisionRecordId: input.decisionRecordId,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Capture feedback for multiple decisions.
     */
    async captureBulkFeedback(input: BulkFeedbackInput): Promise<BulkFeedbackResult> {
        const span = this.observability?.tracer?.startSpan('feedback.captureBulk');

        const results: CaptureFeedbackResult[] = [];
        let successCount = 0;
        let failureCount = 0;

        for (const item of input.items) {
            const result = await this.captureFeedback(item);
            results.push(result);

            if (result.success) {
                successCount++;
            } else {
                failureCount++;
            }
        }

        this.observability?.metrics?.incrementCounter('feedback.bulk_processed', 1, {
            total: String(input.items.length),
            success: String(successCount),
            failure: String(failureCount),
        });

        span?.end();

        return {
            totalProcessed: input.items.length,
            successCount,
            failureCount,
            results,
        };
    }

    /**
     * Get feedback statistics for an agent.
     */
    async getAgentFeedbackStats(agentName: string): Promise<{
        totalFeedback: number;
        acceptedCount: number;
        rejectedCount: number;
        pendingCount: number;
        acceptanceRate: number | null;
    }> {
        const profile = await this.learningRepository.findByAgentName(agentName);

        if (!profile) {
            return {
                totalFeedback: 0,
                acceptedCount: 0,
                rejectedCount: 0,
                pendingCount: 0,
                acceptanceRate: null,
            };
        }

        const accepted = profile.feedbackHistory.filter(f => f.userAccepted === true).length;
        const rejected = profile.feedbackHistory.filter(f => f.userAccepted === false).length;
        const pending = profile.feedbackHistory.filter(f => f.userAccepted === null).length;
        const decided = accepted + rejected;

        return {
            totalFeedback: profile.totalFeedbackReceived,
            acceptedCount: accepted,
            rejectedCount: rejected,
            pendingCount: pending,
            acceptanceRate: decided > 0 ? accepted / decided : null,
        };
    }

    /**
     * Get pending decisions awaiting feedback.
     */
    async getPendingFeedbackDecisions(
        agentName?: string,
        limit: number = 50
    ): Promise<Array<{
        decisionRecordId: string;
        agentName: string;
        decisionType: string;
        decisionContent: string;
        timestamp: Date;
    }>> {
        const decisions = await this.decisionRepository.query({
            agentName,
            hasOutcome: false,
            limit,
        });

        return decisions.map(d => ({
            decisionRecordId: d.id,
            agentName: d.agentName,
            decisionType: d.decisionType,
            decisionContent: d.decisionContent,
            timestamp: d.timestamp,
        }));
    }

    // ========== V9: Auto-Suggestion Triggering ==========

    /**
     * V9: Check if feedback threshold is met and trigger suggestion analysis.
     * Returns the number of suggestions created.
     */
    private async maybeTrigggerSuggestionAnalysis(agentName: string): Promise<number> {
        if (!this.config.autoTriggerSuggestions || !this.suggestionService) {
            return 0;
        }

        // Increment feedback count for this agent
        const currentCount = (this.feedbackCountSinceLastAnalysis.get(agentName) ?? 0) + 1;
        this.feedbackCountSinceLastAnalysis.set(agentName, currentCount);

        // Check if threshold is met
        if (currentCount < this.config.suggestionThreshold) {
            return 0;
        }

        // Reset counter and trigger analysis
        this.feedbackCountSinceLastAnalysis.set(agentName, 0);

        this.observability?.logger?.info('Triggering suggestion analysis', {
            agentName,
            feedbackCount: currentCount,
            threshold: this.config.suggestionThreshold,
        });

        try {
            const suggestionIds = await this.suggestionService.analyzeFeedbackAndSuggest(agentName);

            this.observability?.metrics?.incrementCounter('feedback.suggestions_triggered', suggestionIds.length, {
                agent: agentName,
            });

            this.observability?.logger?.info('Suggestions created from feedback analysis', {
                agentName,
                suggestionCount: suggestionIds.length,
                suggestionIds,
            });

            return suggestionIds.length;
        } catch (error) {
            this.observability?.logger?.error(
                'Failed to trigger suggestion analysis',
                error instanceof Error ? error : undefined,
                { agentName }
            );
            return 0;
        }
    }

    /**
     * V9: Manually trigger suggestion analysis for an agent.
     */
    async triggerSuggestionAnalysis(agentName: string): Promise<string[]> {
        if (!this.suggestionService) {
            throw new Error('PreferenceSuggestionService not configured');
        }

        this.observability?.logger?.info('Manual suggestion analysis triggered', { agentName });

        const suggestionIds = await this.suggestionService.analyzeFeedbackAndSuggest(agentName);

        this.observability?.metrics?.incrementCounter('feedback.manual_analysis_triggered', 1, {
            agent: agentName,
            suggestions: String(suggestionIds.length),
        });

        return suggestionIds;
    }

    /**
     * V9: Get the current feedback count since last analysis.
     */
    getFeedbackCountSinceLastAnalysis(agentName: string): number {
        return this.feedbackCountSinceLastAnalysis.get(agentName) ?? 0;
    }

    /**
     * V9: Reset feedback counter (useful for testing).
     */
    resetFeedbackCounter(agentName?: string): void {
        if (agentName) {
            this.feedbackCountSinceLastAnalysis.delete(agentName);
        } else {
            this.feedbackCountSinceLastAnalysis.clear();
        }
    }
}
