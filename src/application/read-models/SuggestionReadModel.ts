/**
 * SuggestionReadModel - V12 CQRS-style projection for suggestions.
 *
 * Query-optimized, UI-safe model for displaying pending and processed suggestions.
 * This is a read-only projection - no mutations allowed.
 */

/**
 * Status of a suggestion.
 */
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'auto_applied';

/**
 * Read model for suggestion display.
 */
export interface SuggestionReadModel {
    /** Unique ID of the suggestion */
    suggestionId: string;
    /** Agent type that created this suggestion */
    agentType: string;
    /** The preference key being suggested */
    preferenceKey: string;
    /** The proposed value */
    proposedValue: unknown;
    /** Current value (for comparison) */
    currentValue?: unknown;
    /** Confidence score (0-1) */
    confidenceScore: number;
    /** Current status of the suggestion */
    status: SuggestionStatus;
    /** Whether this suggestion requires explicit approval */
    requiresApproval: boolean;
    /** Reason for the suggestion */
    reason?: string;
    /** When the suggestion was created */
    createdAt: Date;
    /** When the suggestion was processed (if applicable) */
    processedAt?: Date;
}

/**
 * Builder for SuggestionReadModel.
 */
export class SuggestionReadModelBuilder {
    private model: Partial<SuggestionReadModel> = {
        status: 'pending',
        requiresApproval: false,
    };

    static create(): SuggestionReadModelBuilder {
        return new SuggestionReadModelBuilder();
    }

    withSuggestionId(id: string): this {
        this.model.suggestionId = id;
        return this;
    }

    withAgentType(agentType: string): this {
        this.model.agentType = agentType;
        return this;
    }

    withPreferenceKey(key: string): this {
        this.model.preferenceKey = key;
        return this;
    }

    withProposedValue(value: unknown): this {
        this.model.proposedValue = value;
        return this;
    }

    withCurrentValue(value: unknown): this {
        this.model.currentValue = value;
        return this;
    }

    withConfidenceScore(score: number): this {
        this.model.confidenceScore = Math.max(0, Math.min(1, score));
        return this;
    }

    withStatus(status: SuggestionStatus): this {
        this.model.status = status;
        return this;
    }

    withRequiresApproval(requires: boolean): this {
        this.model.requiresApproval = requires;
        return this;
    }

    withReason(reason: string): this {
        this.model.reason = reason;
        return this;
    }

    withCreatedAt(date: Date): this {
        this.model.createdAt = date;
        return this;
    }

    withProcessedAt(date: Date): this {
        this.model.processedAt = date;
        return this;
    }

    build(): SuggestionReadModel {
        if (!this.model.suggestionId || !this.model.agentType || !this.model.preferenceKey) {
            throw new Error('SuggestionReadModel requires suggestionId, agentType, and preferenceKey');
        }

        return {
            suggestionId: this.model.suggestionId,
            agentType: this.model.agentType,
            preferenceKey: this.model.preferenceKey,
            proposedValue: this.model.proposedValue,
            currentValue: this.model.currentValue,
            confidenceScore: this.model.confidenceScore ?? 0,
            status: this.model.status ?? 'pending',
            requiresApproval: this.model.requiresApproval ?? false,
            reason: this.model.reason,
            createdAt: this.model.createdAt ?? new Date(),
            processedAt: this.model.processedAt,
        };
    }
}
