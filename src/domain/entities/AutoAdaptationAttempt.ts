/**
 * AutoAdaptationAttempt - V10 audit entity for auto-adaptation attempts.
 *
 * Records every auto-adaptation attempt for:
 * - Full audit trail
 * - Rollback support
 * - Analytics and debugging
 */

import { RiskLevel } from '../value-objects/PreferenceTypes.js';

/**
 * Result of an auto-adaptation attempt.
 */
export type AutoAdaptationResult = 'applied' | 'blocked' | 'skipped';

/**
 * Reason why an auto-adaptation was blocked.
 */
export type BlockReason =
    | 'user_not_opted_in'
    | 'mode_is_manual'
    | 'cooldown_not_elapsed'
    | 'rate_limit_exceeded'
    | 'risk_level_not_allowed'
    | 'preference_locked'
    | 'confidence_too_low'
    | 'preference_not_adaptive'
    | 'validation_failed';

/**
 * Reason why an auto-adaptation was skipped.
 */
export type SkipReason =
    | 'no_pending_suggestions'
    | 'suggestion_already_processed'
    | 'preference_already_at_suggested_value';

/**
 * An auto-adaptation attempt record.
 */
export interface IAutoAdaptationAttempt {
    id: string;
    agentName: string;
    timestamp: Date;

    /** The suggestion that triggered this attempt */
    suggestionId: string;

    /** Preference being adapted */
    category: string;
    key: string;

    /** Value change */
    previousValue: unknown;
    suggestedValue: unknown;

    /** Confidence of the suggestion */
    confidence: number;

    /** Risk level of the preference */
    riskLevel: RiskLevel;

    /** Result of the attempt */
    result: AutoAdaptationResult;

    /** Reason for blocking (if result is 'blocked') */
    blockReason?: BlockReason;

    /** Reason for skipping (if result is 'skipped') */
    skipReason?: SkipReason;

    /** Whether this was later rolled back */
    rolledBack: boolean;

    /** When it was rolled back (if applicable) */
    rolledBackAt?: Date;

    /** Why it was rolled back (if applicable) */
    rollbackReason?: string;

    /** Policy ID that governed this attempt */
    policyId: string;

    /** Policy snapshot at time of attempt (for audit) */
    policySnapshot: {
        mode: string;
        userOptedIn: boolean;
        minConfidence: number;
        allowedRiskLevels: RiskLevel[];
    };
}

/**
 * Builder for AutoAdaptationAttempt.
 */
export class AutoAdaptationAttemptBuilder {
    private attempt: Partial<IAutoAdaptationAttempt> = {
        rolledBack: false,
    };

    static create(): AutoAdaptationAttemptBuilder {
        return new AutoAdaptationAttemptBuilder();
    }

    /**
     * Create an 'applied' attempt.
     */
    static applied(
        id: string,
        agentName: string,
        suggestionId: string,
        category: string,
        key: string,
        previousValue: unknown,
        suggestedValue: unknown,
        confidence: number,
        riskLevel: RiskLevel,
        policyId: string,
        policySnapshot: IAutoAdaptationAttempt['policySnapshot']
    ): IAutoAdaptationAttempt {
        return AutoAdaptationAttemptBuilder.create()
            .withId(id)
            .withAgentName(agentName)
            .withSuggestionId(suggestionId)
            .withPreference(category, key)
            .withValues(previousValue, suggestedValue)
            .withConfidence(confidence)
            .withRiskLevel(riskLevel)
            .withResult('applied')
            .withPolicy(policyId, policySnapshot)
            .build();
    }

    /**
     * Create a 'blocked' attempt.
     */
    static blocked(
        id: string,
        agentName: string,
        suggestionId: string,
        category: string,
        key: string,
        previousValue: unknown,
        suggestedValue: unknown,
        confidence: number,
        riskLevel: RiskLevel,
        blockReason: BlockReason,
        policyId: string,
        policySnapshot: IAutoAdaptationAttempt['policySnapshot']
    ): IAutoAdaptationAttempt {
        return AutoAdaptationAttemptBuilder.create()
            .withId(id)
            .withAgentName(agentName)
            .withSuggestionId(suggestionId)
            .withPreference(category, key)
            .withValues(previousValue, suggestedValue)
            .withConfidence(confidence)
            .withRiskLevel(riskLevel)
            .withResult('blocked')
            .withBlockReason(blockReason)
            .withPolicy(policyId, policySnapshot)
            .build();
    }

    /**
     * Create a 'skipped' attempt.
     */
    static skipped(
        id: string,
        agentName: string,
        suggestionId: string,
        category: string,
        key: string,
        skipReason: SkipReason,
        policyId: string,
        policySnapshot: IAutoAdaptationAttempt['policySnapshot']
    ): IAutoAdaptationAttempt {
        return AutoAdaptationAttemptBuilder.create()
            .withId(id)
            .withAgentName(agentName)
            .withSuggestionId(suggestionId)
            .withPreference(category, key)
            .withValues(undefined, undefined)
            .withConfidence(0)
            .withRiskLevel('low')
            .withResult('skipped')
            .withSkipReason(skipReason)
            .withPolicy(policyId, policySnapshot)
            .build();
    }

    withId(id: string): this {
        this.attempt.id = id;
        return this;
    }

    withAgentName(agentName: string): this {
        this.attempt.agentName = agentName;
        return this;
    }

    withSuggestionId(suggestionId: string): this {
        this.attempt.suggestionId = suggestionId;
        return this;
    }

    withPreference(category: string, key: string): this {
        this.attempt.category = category;
        this.attempt.key = key;
        return this;
    }

    withValues(previousValue: unknown, suggestedValue: unknown): this {
        this.attempt.previousValue = previousValue;
        this.attempt.suggestedValue = suggestedValue;
        return this;
    }

    withConfidence(confidence: number): this {
        this.attempt.confidence = confidence;
        return this;
    }

    withRiskLevel(riskLevel: RiskLevel): this {
        this.attempt.riskLevel = riskLevel;
        return this;
    }

    withResult(result: AutoAdaptationResult): this {
        this.attempt.result = result;
        return this;
    }

    withBlockReason(reason: BlockReason): this {
        this.attempt.blockReason = reason;
        return this;
    }

    withSkipReason(reason: SkipReason): this {
        this.attempt.skipReason = reason;
        return this;
    }

    withPolicy(policyId: string, snapshot: IAutoAdaptationAttempt['policySnapshot']): this {
        this.attempt.policyId = policyId;
        this.attempt.policySnapshot = snapshot;
        return this;
    }

    build(): IAutoAdaptationAttempt {
        if (!this.attempt.id || !this.attempt.agentName || !this.attempt.suggestionId) {
            throw new Error('AutoAdaptationAttempt requires id, agentName, and suggestionId');
        }

        return {
            id: this.attempt.id,
            agentName: this.attempt.agentName,
            timestamp: new Date(),
            suggestionId: this.attempt.suggestionId,
            category: this.attempt.category ?? '',
            key: this.attempt.key ?? '',
            previousValue: this.attempt.previousValue,
            suggestedValue: this.attempt.suggestedValue,
            confidence: this.attempt.confidence ?? 0,
            riskLevel: this.attempt.riskLevel ?? 'low',
            result: this.attempt.result ?? 'skipped',
            blockReason: this.attempt.blockReason,
            skipReason: this.attempt.skipReason,
            rolledBack: this.attempt.rolledBack ?? false,
            policyId: this.attempt.policyId ?? '',
            policySnapshot: this.attempt.policySnapshot ?? {
                mode: 'manual',
                userOptedIn: false,
                minConfidence: 0.8,
                allowedRiskLevels: ['low'],
            },
        };
    }
}

/**
 * Helper functions for working with auto-adaptation attempts.
 */
export const AutoAdaptationAttemptUtils = {
    /**
     * Mark an attempt as rolled back.
     */
    markRolledBack(attempt: IAutoAdaptationAttempt, reason: string): IAutoAdaptationAttempt {
        return {
            ...attempt,
            rolledBack: true,
            rolledBackAt: new Date(),
            rollbackReason: reason,
        };
    },

    /**
     * Check if an attempt can be rolled back.
     */
    canRollback(attempt: IAutoAdaptationAttempt): boolean {
        return attempt.result === 'applied' && !attempt.rolledBack;
    },

    /**
     * Get human-readable description of block reason.
     */
    getBlockReasonDescription(reason: BlockReason): string {
        const descriptions: Record<BlockReason, string> = {
            user_not_opted_in: 'User has not opted in to auto-adaptation',
            mode_is_manual: 'Adaptation mode is set to manual',
            cooldown_not_elapsed: 'Cooldown period has not elapsed',
            rate_limit_exceeded: 'Rate limit for auto-adaptations exceeded',
            risk_level_not_allowed: 'Preference risk level is not allowed for auto-adaptation',
            preference_locked: 'Preference is locked and cannot be changed',
            confidence_too_low: 'Suggestion confidence is below threshold',
            preference_not_adaptive: 'Preference does not support auto-adaptation',
            validation_failed: 'Suggested value failed validation',
        };
        return descriptions[reason];
    },

    /**
     * Get human-readable description of skip reason.
     */
    getSkipReasonDescription(reason: SkipReason): string {
        const descriptions: Record<SkipReason, string> = {
            no_pending_suggestions: 'No pending suggestions to process',
            suggestion_already_processed: 'Suggestion has already been processed',
            preference_already_at_suggested_value: 'Preference is already at the suggested value',
        };
        return descriptions[reason];
    },
};
