/**
 * PreferenceReadModel - V12 CQRS-style projection for preferences.
 *
 * Query-optimized, UI-safe model for displaying preference state.
 * This is a read-only projection - no mutations allowed.
 */

import { RiskLevel } from '../../domain/value-objects/PreferenceTypes.js';

/**
 * Source of the last change to a preference.
 */
export type ChangeSource = 'manual' | 'auto';

/**
 * Read model for preference display.
 */
export interface PreferenceReadModel {
    /** Agent type this preference belongs to */
    agentType: string;
    /** The preference key (e.g., 'communication.tone') */
    preferenceKey: string;
    /** Current value of the preference */
    currentValue: unknown;
    /** Default value for this preference */
    defaultValue: unknown;
    /** Whether this preference can be auto-adapted */
    adaptive: boolean;
    /** Risk level of changing this preference */
    riskLevel: RiskLevel;
    /** When the preference was last changed */
    lastChangedAt: Date | null;
    /** How the preference was last changed */
    lastChangeSource: ChangeSource | null;
    /** Whether a rollback is available */
    rollbackAvailable: boolean;
}

/**
 * Builder for PreferenceReadModel.
 */
export class PreferenceReadModelBuilder {
    private model: Partial<PreferenceReadModel> = {
        adaptive: false,
        riskLevel: 'low',
        rollbackAvailable: false,
    };

    static create(): PreferenceReadModelBuilder {
        return new PreferenceReadModelBuilder();
    }

    withAgentType(agentType: string): this {
        this.model.agentType = agentType;
        return this;
    }

    withPreferenceKey(key: string): this {
        this.model.preferenceKey = key;
        return this;
    }

    withCurrentValue(value: unknown): this {
        this.model.currentValue = value;
        return this;
    }

    withDefaultValue(value: unknown): this {
        this.model.defaultValue = value;
        return this;
    }

    withAdaptive(adaptive: boolean): this {
        this.model.adaptive = adaptive;
        return this;
    }

    withRiskLevel(level: RiskLevel): this {
        this.model.riskLevel = level;
        return this;
    }

    withLastChange(at: Date | null, source: ChangeSource | null): this {
        this.model.lastChangedAt = at;
        this.model.lastChangeSource = source;
        return this;
    }

    withRollbackAvailable(available: boolean): this {
        this.model.rollbackAvailable = available;
        return this;
    }

    build(): PreferenceReadModel {
        if (!this.model.agentType || !this.model.preferenceKey) {
            throw new Error('PreferenceReadModel requires agentType and preferenceKey');
        }

        return {
            agentType: this.model.agentType,
            preferenceKey: this.model.preferenceKey,
            currentValue: this.model.currentValue,
            defaultValue: this.model.defaultValue,
            adaptive: this.model.adaptive ?? false,
            riskLevel: this.model.riskLevel ?? 'low',
            lastChangedAt: this.model.lastChangedAt ?? null,
            lastChangeSource: this.model.lastChangeSource ?? null,
            rollbackAvailable: this.model.rollbackAvailable ?? false,
        };
    }
}
