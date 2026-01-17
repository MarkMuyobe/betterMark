/**
 * PreferenceSuggestionService - Analyzes feedback to suggest preference changes.
 *
 * V8 Adaptive Agents: This service examines decision outcomes and suggests
 * preference adjustments. Suggestions are NOT auto-applied; they require
 * user approval.
 */

import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { IDecisionRecordRepository } from '../ports/IDecisionRecordRepository.js';
import { ISuggestedPreference, IFeedbackEntry } from '../../domain/entities/AgentLearningProfile.js';
import { PreferenceRegistry } from '../../domain/services/PreferenceRegistry.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

/**
 * Configuration for suggestion analysis.
 */
export interface SuggestionAnalysisConfig {
    /** Minimum feedback entries needed to make a suggestion */
    minFeedbackForSuggestion: number;
    /** Minimum confidence to create a suggestion */
    minSuggestionConfidence: number;
    /** Look at feedback from the last N days */
    feedbackWindowDays: number;
}

const DEFAULT_CONFIG: SuggestionAnalysisConfig = {
    minFeedbackForSuggestion: 10,
    minSuggestionConfidence: 0.7,
    feedbackWindowDays: 30,
};

/**
 * PreferenceSuggestionService - Creates preference suggestions from feedback.
 */
export class PreferenceSuggestionService {
    private config: SuggestionAnalysisConfig;

    constructor(
        private learningRepository: IAgentLearningRepository,
        private decisionRecordRepository: IDecisionRecordRepository,
        private preferenceRegistry: PreferenceRegistry,
        config?: Partial<SuggestionAnalysisConfig>
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Analyzes feedback for an agent and creates suggestions.
     * Returns the IDs of newly created suggestions.
     */
    async analyzeFeedbackAndSuggest(agentName: string): Promise<string[]> {
        const profile = await this.learningRepository.findByAgentName(agentName);
        if (!profile) return [];

        // Get recent feedback within the window
        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() - this.config.feedbackWindowDays);

        const recentFeedback = profile.feedbackHistory.filter(
            f => f.timestamp >= windowStart && f.userAccepted !== null
        );

        if (recentFeedback.length < this.config.minFeedbackForSuggestion) {
            return [];
        }

        const suggestionIds: string[] = [];

        // Get preference definitions for this agent
        const definitions = this.preferenceRegistry.getDefinitionsForAgent(agentName);

        for (const definition of definitions) {
            const suggestion = await this.analyzePreference(
                agentName,
                definition.category,
                definition.key,
                definition.allowedValues as unknown[],
                recentFeedback
            );

            if (suggestion) {
                await this.learningRepository.addSuggestedPreference(agentName, suggestion);
                suggestionIds.push(suggestion.suggestionId);
            }
        }

        return suggestionIds;
    }

    /**
     * Analyzes feedback for a specific preference and potentially creates a suggestion.
     */
    private async analyzePreference(
        agentName: string,
        category: string,
        key: string,
        allowedValues: unknown[],
        feedback: IFeedbackEntry[]
    ): Promise<ISuggestedPreference | null> {
        // Get current preference value
        const profile = await this.learningRepository.findByAgentName(agentName);
        if (!profile) return null;

        const currentPref = profile.preferences.find(
            p => p.category === category && p.key === key
        );
        const currentValue = currentPref?.value ?? this.preferenceRegistry.getDefaultValue(category, key);

        // Check if there's already a pending suggestion for this preference
        const pendingSuggestions = profile.suggestedPreferences.filter(
            s => s.status === 'pending' && s.category === category && s.key === key
        );
        if (pendingSuggestions.length > 0) {
            return null; // Already has a pending suggestion
        }

        // Analyze feedback to determine if a different value would be better
        // This is a simplified analysis - in production you'd want more sophisticated ML
        const analysis = this.analyzeValuePerformance(feedback, category, key, allowedValues, currentValue);

        if (!analysis.shouldSuggest) {
            return null;
        }

        const suggestionId = IdGenerator.generate();
        const decisionRecordIds = feedback
            .slice(0, 20) // Use most recent 20 as "learned from"
            .map(f => f.decisionRecordId);

        return {
            suggestionId,
            category,
            key,
            suggestedValue: analysis.suggestedValue,
            currentValue,
            confidence: analysis.confidence,
            reason: analysis.reason,
            learnedFrom: decisionRecordIds,
            suggestedAt: new Date(),
            status: 'pending',
        };
    }

    /**
     * Analyzes feedback to determine if a different preference value would perform better.
     *
     * This is a simplified heuristic-based analysis. A production system would
     * use more sophisticated ML approaches.
     */
    private analyzeValuePerformance(
        feedback: IFeedbackEntry[],
        category: string,
        key: string,
        allowedValues: unknown[],
        currentValue: unknown
    ): { shouldSuggest: boolean; suggestedValue: unknown; confidence: number; reason: string } {
        // Count acceptance rates by context
        const acceptedCount = feedback.filter(f => f.userAccepted === true).length;
        const rejectedCount = feedback.filter(f => f.userAccepted === false).length;
        const totalDecided = acceptedCount + rejectedCount;

        if (totalDecided < this.config.minFeedbackForSuggestion) {
            return { shouldSuggest: false, suggestedValue: null, confidence: 0, reason: '' };
        }

        const acceptanceRate = acceptedCount / totalDecided;

        // If acceptance rate is low, suggest a different value
        if (acceptanceRate < 0.5) {
            // Find an alternative value
            const otherValues = allowedValues.filter(v => v !== currentValue);
            if (otherValues.length === 0) {
                return { shouldSuggest: false, suggestedValue: null, confidence: 0, reason: '' };
            }

            // For now, just suggest the "next" value in the list
            // A real system would analyze which context patterns correlate with rejection
            const currentIndex = allowedValues.indexOf(currentValue);
            const nextIndex = (currentIndex + 1) % allowedValues.length;
            const suggestedValue = allowedValues[nextIndex];

            const confidence = Math.min(0.9, 1 - acceptanceRate);

            return {
                shouldSuggest: confidence >= this.config.minSuggestionConfidence,
                suggestedValue,
                confidence,
                reason: `Current acceptance rate is ${(acceptanceRate * 100).toFixed(1)}%. ` +
                    `Suggesting "${suggestedValue}" based on ${totalDecided} decisions.`,
            };
        }

        // Acceptance rate is good, no suggestion needed
        return { shouldSuggest: false, suggestedValue: null, confidence: 0, reason: '' };
    }

    /**
     * Manually creates a suggestion for user review.
     */
    async createManualSuggestion(
        agentName: string,
        category: string,
        key: string,
        suggestedValue: unknown,
        reason: string
    ): Promise<string> {
        // Validate the suggested value
        const validation = this.preferenceRegistry.validate(category, key, suggestedValue);
        if (!validation.valid) {
            throw new Error(`Invalid preference value: ${validation.reason}`);
        }

        const profile = await this.learningRepository.findByAgentName(agentName);
        const currentPref = profile?.preferences.find(
            p => p.category === category && p.key === key
        );
        const currentValue = currentPref?.value ?? this.preferenceRegistry.getDefaultValue(category, key);

        const suggestion: ISuggestedPreference = {
            suggestionId: IdGenerator.generate(),
            category,
            key,
            suggestedValue,
            currentValue,
            confidence: 1.0, // Manual suggestions have full confidence
            reason,
            learnedFrom: [], // No decision records for manual suggestions
            suggestedAt: new Date(),
            status: 'pending',
        };

        await this.learningRepository.addSuggestedPreference(agentName, suggestion);
        return suggestion.suggestionId;
    }

    /**
     * Gets all pending suggestions for an agent.
     */
    async getPendingSuggestions(agentName: string): Promise<ISuggestedPreference[]> {
        return this.learningRepository.getPendingSuggestions(agentName);
    }

    /**
     * Approves a suggestion.
     */
    async approveSuggestion(agentName: string, suggestionId: string): Promise<void> {
        await this.learningRepository.approveSuggestion(agentName, suggestionId, 'user');
    }

    /**
     * Rejects a suggestion.
     */
    async rejectSuggestion(agentName: string, suggestionId: string): Promise<void> {
        await this.learningRepository.rejectSuggestion(agentName, suggestionId);
    }
}
