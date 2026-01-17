/**
 * InMemoryAgentLearningRepository - In-memory implementation for testing.
 */

import {
    IAgentLearningRepository,
    LearningProfileQuery,
    LearningStats,
} from '../../../application/ports/IAgentLearningRepository.js';
import {
    IAgentLearningProfile,
    IFeedbackEntry,
    IFeedbackPattern,
    IUserPreference,
    ISuggestedPreference,
    IPreferenceChangeRecord,
    AgentLearningProfileBuilder,
    AgentLearningProfileUtils,
} from '../../../domain/entities/AgentLearningProfile.js';
import { PreferenceRegistry } from '../../../domain/services/PreferenceRegistry.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

export class InMemoryAgentLearningRepository implements IAgentLearningRepository {
    private profiles: Map<string, IAgentLearningProfile> = new Map();
    private byAgentName: Map<string, string> = new Map(); // agentName -> id
    private preferenceRegistry: PreferenceRegistry;

    constructor(preferenceRegistry?: PreferenceRegistry) {
        this.preferenceRegistry = preferenceRegistry ?? PreferenceRegistry.createDefault();
    }

    async save(profile: IAgentLearningProfile): Promise<void> {
        this.profiles.set(profile.id, { ...profile, updatedAt: new Date() });
        this.byAgentName.set(profile.agentName, profile.id);
    }

    async findById(id: string): Promise<IAgentLearningProfile | null> {
        return this.profiles.get(id) ?? null;
    }

    async findByAgentName(agentName: string): Promise<IAgentLearningProfile | null> {
        const id = this.byAgentName.get(agentName);
        if (!id) return null;
        return this.profiles.get(id) ?? null;
    }

    async getOrCreate(agentName: string): Promise<IAgentLearningProfile> {
        const existing = await this.findByAgentName(agentName);
        if (existing) return existing;

        const profile = AgentLearningProfileBuilder.create()
            .withId(IdGenerator.generate())
            .withAgentName(agentName)
            .build();

        await this.save(profile);
        return profile;
    }

    async query(params: LearningProfileQuery): Promise<IAgentLearningProfile[]> {
        let results = Array.from(this.profiles.values());

        if (params.agentName) {
            results = results.filter(p => p.agentName === params.agentName);
        }
        if (params.learningEnabled !== undefined) {
            results = results.filter(p => p.learningEnabled === params.learningEnabled);
        }
        if (params.minFeedbackCount !== undefined) {
            results = results.filter(p => p.totalFeedbackReceived >= params.minFeedbackCount!);
        }
        if (params.needsLearningRun) {
            results = results.filter(p => AgentLearningProfileUtils.needsLearningRun(p));
        }

        return results;
    }

    async addFeedback(agentName: string, entry: IFeedbackEntry): Promise<void> {
        const profile = await this.getOrCreate(agentName);
        const updated = AgentLearningProfileUtils.addFeedback(profile, entry);
        await this.save(updated);
    }

    async addPattern(agentName: string, pattern: IFeedbackPattern): Promise<void> {
        const profile = await this.getOrCreate(agentName);

        // Check if pattern already exists, update if so
        const existingIndex = profile.patterns.findIndex(p => p.patternId === pattern.patternId);
        let updatedPatterns: IFeedbackPattern[];

        if (existingIndex >= 0) {
            updatedPatterns = [...profile.patterns];
            updatedPatterns[existingIndex] = pattern;
        } else {
            updatedPatterns = [...profile.patterns, pattern];
        }

        await this.save({
            ...profile,
            patterns: updatedPatterns,
            updatedAt: new Date(),
        });
    }

    async setPreference(
        agentName: string,
        preference: IUserPreference,
        changedBy: 'user' | 'system' | 'learning' = 'system',
        reason?: string,
        suggestionId?: string
    ): Promise<void> {
        const profile = await this.getOrCreate(agentName);

        // V8: Validate the preference value
        const validation = this.preferenceRegistry.validate(
            preference.category,
            preference.key,
            preference.value
        );
        if (!validation.valid) {
            throw new Error(`Invalid preference value: ${validation.reason}`);
        }

        // Find existing preference to record history
        const existingPref = profile.preferences.find(
            p => p.category === preference.category && p.key === preference.key
        );
        const previousValue = existingPref?.value ?? null;

        // Check if preference exists, update if so
        const existingIndex = profile.preferences.findIndex(
            p => p.category === preference.category && p.key === preference.key
        );
        let updatedPreferences: IUserPreference[];

        if (existingIndex >= 0) {
            updatedPreferences = [...profile.preferences];
            updatedPreferences[existingIndex] = preference;
        } else {
            updatedPreferences = [...profile.preferences, preference];
        }

        // V8: Record the change in history
        const changeRecord: IPreferenceChangeRecord = {
            changeId: IdGenerator.generate(),
            category: preference.category,
            key: preference.key,
            previousValue,
            newValue: preference.value,
            changedAt: new Date(),
            changedBy,
            reason,
            suggestionId,
        };

        await this.save({
            ...profile,
            preferences: updatedPreferences,
            preferenceChangeHistory: [changeRecord, ...profile.preferenceChangeHistory],
            updatedAt: new Date(),
        });
    }

    async markLearningRunCompleted(agentName: string): Promise<void> {
        const profile = await this.findByAgentName(agentName);
        if (!profile) return;

        await this.save({
            ...profile,
            lastLearningRunAt: new Date(),
            learningVersion: profile.learningVersion + 1,
            updatedAt: new Date(),
        });
    }

    async getStats(): Promise<LearningStats> {
        const profiles = Array.from(this.profiles.values());

        const totalProfiles = profiles.length;
        const profilesWithLearningEnabled = profiles.filter(p => p.learningEnabled).length;
        const totalFeedbackEntries = profiles.reduce((sum, p) => sum + p.totalFeedbackReceived, 0);
        const totalPatternsDiscovered = profiles.reduce((sum, p) => sum + p.patterns.length, 0);
        const totalPreferencesLearned = profiles.reduce((sum, p) => sum + p.preferences.length, 0);

        // Calculate average acceptance rate
        const profilesWithAcceptance = profiles.filter(p => p.overallAcceptanceRate !== null);
        const averageAcceptanceRate = profilesWithAcceptance.length > 0
            ? profilesWithAcceptance.reduce((sum, p) => sum + (p.overallAcceptanceRate ?? 0), 0) / profilesWithAcceptance.length
            : null;

        return {
            totalProfiles,
            profilesWithLearningEnabled,
            totalFeedbackEntries,
            totalPatternsDiscovered,
            totalPreferencesLearned,
            averageAcceptanceRate,
        };
    }

    async getProfilesNeedingLearningRun(): Promise<IAgentLearningProfile[]> {
        return this.query({ needsLearningRun: true });
    }

    async delete(agentName: string): Promise<void> {
        const id = this.byAgentName.get(agentName);
        if (id) {
            this.profiles.delete(id);
            this.byAgentName.delete(agentName);
        }
    }

    // ========== V8 Adaptive Agents: Suggestion Methods ==========

    async addSuggestedPreference(agentName: string, suggestion: ISuggestedPreference): Promise<void> {
        const profile = await this.getOrCreate(agentName);

        // Validate the suggested value
        const validation = this.preferenceRegistry.validate(
            suggestion.category,
            suggestion.key,
            suggestion.suggestedValue
        );
        if (!validation.valid) {
            throw new Error(`Invalid suggested preference value: ${validation.reason}`);
        }

        await this.save({
            ...profile,
            suggestedPreferences: [...profile.suggestedPreferences, suggestion],
            updatedAt: new Date(),
        });
    }

    async getPendingSuggestions(agentName: string): Promise<ISuggestedPreference[]> {
        const profile = await this.findByAgentName(agentName);
        if (!profile) return [];
        return profile.suggestedPreferences.filter(s => s.status === 'pending');
    }

    async approveSuggestion(
        agentName: string,
        suggestionId: string,
        changedBy: 'user' | 'system' | 'learning' = 'user'
    ): Promise<void> {
        const profile = await this.findByAgentName(agentName);
        if (!profile) return;

        const suggestionIndex = profile.suggestedPreferences.findIndex(
            s => s.suggestionId === suggestionId
        );
        if (suggestionIndex < 0) return;

        const suggestion = profile.suggestedPreferences[suggestionIndex];
        if (suggestion.status !== 'pending') return;

        // Mark suggestion as approved
        const updatedSuggestions = [...profile.suggestedPreferences];
        updatedSuggestions[suggestionIndex] = { ...suggestion, status: 'approved' };

        await this.save({
            ...profile,
            suggestedPreferences: updatedSuggestions,
            updatedAt: new Date(),
        });

        // Apply the preference
        const preference: IUserPreference = {
            preferenceId: IdGenerator.generate(),
            category: suggestion.category,
            key: suggestion.key,
            value: suggestion.suggestedValue,
            confidence: suggestion.confidence,
            learnedFrom: suggestion.learnedFrom,
            lastUpdated: new Date(),
        };

        await this.setPreference(
            agentName,
            preference,
            changedBy,
            suggestion.reason,
            suggestion.suggestionId
        );
    }

    async rejectSuggestion(agentName: string, suggestionId: string): Promise<void> {
        const profile = await this.findByAgentName(agentName);
        if (!profile) return;

        const suggestionIndex = profile.suggestedPreferences.findIndex(
            s => s.suggestionId === suggestionId
        );
        if (suggestionIndex < 0) return;

        const suggestion = profile.suggestedPreferences[suggestionIndex];
        if (suggestion.status !== 'pending') return;

        // Mark suggestion as rejected
        const updatedSuggestions = [...profile.suggestedPreferences];
        updatedSuggestions[suggestionIndex] = { ...suggestion, status: 'rejected' };

        await this.save({
            ...profile,
            suggestedPreferences: updatedSuggestions,
            updatedAt: new Date(),
        });
    }

    // ========== V8 Adaptive Agents: Audit and Rollback Methods ==========

    async getPreferenceHistory(agentName: string, limit?: number): Promise<IPreferenceChangeRecord[]> {
        const profile = await this.findByAgentName(agentName);
        if (!profile) return [];

        const history = profile.preferenceChangeHistory;
        return limit ? history.slice(0, limit) : history;
    }

    async resetAllPreferences(
        agentName: string,
        changedBy: 'user' | 'system' | 'learning' = 'user'
    ): Promise<void> {
        const profile = await this.findByAgentName(agentName);
        if (!profile) return;

        // Get all definitions for this agent's preferences
        const definitions = this.preferenceRegistry.getDefinitionsForAgent(agentName);

        for (const definition of definitions) {
            const existingPref = profile.preferences.find(
                p => p.category === definition.category && p.key === definition.key
            );

            if (existingPref && existingPref.value !== definition.defaultValue) {
                const preference: IUserPreference = {
                    preferenceId: IdGenerator.generate(),
                    category: definition.category,
                    key: definition.key,
                    value: definition.defaultValue,
                    confidence: 1.0,
                    learnedFrom: [],
                    lastUpdated: new Date(),
                };

                await this.setPreference(
                    agentName,
                    preference,
                    changedBy,
                    'Reset to default value'
                );
            }
        }
    }

    async resetPreference(
        agentName: string,
        category: string,
        key: string,
        changedBy: 'user' | 'system' | 'learning' = 'user'
    ): Promise<void> {
        const defaultValue = this.preferenceRegistry.getDefaultValue(category, key);
        if (defaultValue === null) {
            throw new Error(`Unknown preference: ${category}.${key}`);
        }

        const profile = await this.findByAgentName(agentName);
        if (!profile) return;

        const existingPref = profile.preferences.find(
            p => p.category === category && p.key === key
        );

        // Only reset if value differs from default
        if (!existingPref || existingPref.value === defaultValue) return;

        const preference: IUserPreference = {
            preferenceId: IdGenerator.generate(),
            category,
            key,
            value: defaultValue,
            confidence: 1.0,
            learnedFrom: [],
            lastUpdated: new Date(),
        };

        await this.setPreference(
            agentName,
            preference,
            changedBy,
            'Reset to default value'
        );
    }

    async rollbackToChange(agentName: string, changeId: string): Promise<void> {
        const profile = await this.findByAgentName(agentName);
        if (!profile) return;

        // Find the change record
        const changeIndex = profile.preferenceChangeHistory.findIndex(
            c => c.changeId === changeId
        );
        if (changeIndex < 0) {
            throw new Error(`Change record not found: ${changeId}`);
        }

        const changeRecord = profile.preferenceChangeHistory[changeIndex];

        // Get all changes that happened after this one (they're in reverse chronological order)
        const changesToUndo = profile.preferenceChangeHistory.slice(0, changeIndex);

        // Group by category/key to find the most recent change to each preference
        const latestChanges = new Map<string, IPreferenceChangeRecord>();
        for (const change of changesToUndo) {
            const key = `${change.category}:${change.key}`;
            if (!latestChanges.has(key)) {
                latestChanges.set(key, change);
            }
        }

        // Rollback each preference that changed since the target change
        for (const [, change] of latestChanges) {
            // Skip if this is the same preference as the target change
            // (it will be handled separately)
            if (change.category === changeRecord.category && change.key === changeRecord.key) {
                continue;
            }

            // Revert to the value before the most recent change
            if (change.previousValue !== null) {
                const preference: IUserPreference = {
                    preferenceId: IdGenerator.generate(),
                    category: change.category,
                    key: change.key,
                    value: change.previousValue,
                    confidence: 1.0,
                    learnedFrom: [],
                    lastUpdated: new Date(),
                };

                await this.setPreference(
                    agentName,
                    preference,
                    'system',
                    `Rollback to change ${changeId}`
                );
            }
        }

        // Restore the target preference to what it was set to at that change
        const preference: IUserPreference = {
            preferenceId: IdGenerator.generate(),
            category: changeRecord.category,
            key: changeRecord.key,
            value: changeRecord.newValue,
            confidence: 1.0,
            learnedFrom: [],
            lastUpdated: new Date(),
        };

        await this.setPreference(
            agentName,
            preference,
            'system',
            `Rollback to change ${changeId}`
        );
    }

    /**
     * Clear all profiles (for testing).
     */
    clear(): void {
        this.profiles.clear();
        this.byAgentName.clear();
    }

    /**
     * Get all profiles (for testing).
     */
    getAll(): IAgentLearningProfile[] {
        return Array.from(this.profiles.values());
    }
}
