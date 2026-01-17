/**
 * PreferenceAuditService - Provides audit trail and rollback capabilities.
 *
 * V8 Adaptive Agents: This service enables reviewing preference change history
 * and rolling back to previous states if needed.
 */

import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { IPreferenceChangeRecord, IUserPreference } from '../../domain/entities/AgentLearningProfile.js';
import { PreferenceRegistry } from '../../domain/services/PreferenceRegistry.js';

/**
 * Summary of preference changes over a period.
 */
export interface PreferenceAuditSummary {
    agentName: string;
    totalChanges: number;
    changesByCategory: Record<string, number>;
    changesBySource: Record<'user' | 'system' | 'learning', number>;
    mostRecentChange: IPreferenceChangeRecord | null;
    oldestChange: IPreferenceChangeRecord | null;
}

/**
 * Result of a reset operation.
 */
export interface ResetResult {
    agentName: string;
    preferencesReset: number;
    changes: Array<{ category: string; key: string; from: unknown; to: unknown }>;
}

/**
 * PreferenceAuditService - Audit trail and rollback for preferences.
 */
export class PreferenceAuditService {
    constructor(
        private learningRepository: IAgentLearningRepository,
        private preferenceRegistry: PreferenceRegistry
    ) {}

    /**
     * Gets the change history for an agent.
     */
    async getChangeHistory(
        agentName: string,
        limit?: number
    ): Promise<IPreferenceChangeRecord[]> {
        return this.learningRepository.getPreferenceHistory(agentName, limit);
    }

    /**
     * Gets a summary of preference changes for an agent.
     */
    async getAuditSummary(agentName: string): Promise<PreferenceAuditSummary> {
        const history = await this.learningRepository.getPreferenceHistory(agentName);

        const changesByCategory: Record<string, number> = {};
        const changesBySource: Record<'user' | 'system' | 'learning', number> = {
            user: 0,
            system: 0,
            learning: 0,
        };

        for (const change of history) {
            changesByCategory[change.category] = (changesByCategory[change.category] ?? 0) + 1;
            changesBySource[change.changedBy]++;
        }

        return {
            agentName,
            totalChanges: history.length,
            changesByCategory,
            changesBySource,
            mostRecentChange: history[0] ?? null,
            oldestChange: history[history.length - 1] ?? null,
        };
    }

    /**
     * Gets changes for a specific preference.
     */
    async getPreferenceChanges(
        agentName: string,
        category: string,
        key: string
    ): Promise<IPreferenceChangeRecord[]> {
        const history = await this.learningRepository.getPreferenceHistory(agentName);
        return history.filter(c => c.category === category && c.key === key);
    }

    /**
     * Gets current preference values compared to defaults.
     */
    async compareToDefaults(agentName: string): Promise<Array<{
        category: string;
        key: string;
        currentValue: unknown;
        defaultValue: unknown;
        isDifferent: boolean;
    }>> {
        const profile = await this.learningRepository.findByAgentName(agentName);
        if (!profile) return [];

        const definitions = this.preferenceRegistry.getDefinitionsForAgent(agentName);
        const comparisons: Array<{
            category: string;
            key: string;
            currentValue: unknown;
            defaultValue: unknown;
            isDifferent: boolean;
        }> = [];

        for (const definition of definitions) {
            const currentPref = profile.preferences.find(
                p => p.category === definition.category && p.key === definition.key
            );
            const currentValue = currentPref?.value ?? definition.defaultValue;

            comparisons.push({
                category: definition.category,
                key: definition.key,
                currentValue,
                defaultValue: definition.defaultValue,
                isDifferent: currentValue !== definition.defaultValue,
            });
        }

        return comparisons;
    }

    /**
     * Resets all preferences for an agent to their default values.
     */
    async resetAllToDefaults(agentName: string): Promise<ResetResult> {
        const comparisons = await this.compareToDefaults(agentName);
        const changesNeeded = comparisons.filter(c => c.isDifferent);

        await this.learningRepository.resetAllPreferences(agentName, 'user');

        return {
            agentName,
            preferencesReset: changesNeeded.length,
            changes: changesNeeded.map(c => ({
                category: c.category,
                key: c.key,
                from: c.currentValue,
                to: c.defaultValue,
            })),
        };
    }

    /**
     * Resets a specific preference to its default value.
     */
    async resetPreferenceToDefault(
        agentName: string,
        category: string,
        key: string
    ): Promise<{ from: unknown; to: unknown } | null> {
        const profile = await this.learningRepository.findByAgentName(agentName);
        if (!profile) return null;

        const currentPref = profile.preferences.find(
            p => p.category === category && p.key === key
        );
        const defaultValue = this.preferenceRegistry.getDefaultValue(category, key);

        if (!currentPref || currentPref.value === defaultValue) {
            return null; // Already at default
        }

        await this.learningRepository.resetPreference(agentName, category, key, 'user');

        return {
            from: currentPref.value,
            to: defaultValue,
        };
    }

    /**
     * Rolls back to a specific point in the change history.
     */
    async rollbackToChange(agentName: string, changeId: string): Promise<void> {
        await this.learningRepository.rollbackToChange(agentName, changeId);
    }

    /**
     * Rolls back the most recent change.
     */
    async undoLastChange(agentName: string): Promise<IPreferenceChangeRecord | null> {
        const history = await this.learningRepository.getPreferenceHistory(agentName, 2);

        if (history.length < 2) {
            // Can't undo - no previous state
            return null;
        }

        // Roll back to the second most recent change (which is the state before the most recent)
        const mostRecent = history[0];
        const previousChange = history[1];

        await this.learningRepository.rollbackToChange(agentName, previousChange.changeId);

        return mostRecent;
    }

    /**
     * Exports the audit trail for an agent as JSON.
     */
    async exportAuditTrail(agentName: string): Promise<{
        agentName: string;
        exportedAt: Date;
        summary: PreferenceAuditSummary;
        currentPreferences: Array<{ category: string; key: string; value: unknown }>;
        changeHistory: IPreferenceChangeRecord[];
    }> {
        const profile = await this.learningRepository.findByAgentName(agentName);
        const summary = await this.getAuditSummary(agentName);
        const history = await this.learningRepository.getPreferenceHistory(agentName);

        const currentPreferences = profile?.preferences.map(p => ({
            category: p.category,
            key: p.key,
            value: p.value,
        })) ?? [];

        return {
            agentName,
            exportedAt: new Date(),
            summary,
            currentPreferences,
            changeHistory: history,
        };
    }
}
