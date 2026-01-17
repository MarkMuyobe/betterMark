/**
 * IAgentLearningRepository - Repository interface for agent learning profiles.
 *
 * V8 preparation: Stores learning data for adaptive agent behavior.
 */

import {
    IAgentLearningProfile,
    IFeedbackEntry,
    IFeedbackPattern,
    IUserPreference,
    ISuggestedPreference,
    IPreferenceChangeRecord,
} from '../../domain/entities/AgentLearningProfile.js';

/**
 * Query parameters for learning profiles.
 */
export interface LearningProfileQuery {
    agentName?: string;
    learningEnabled?: boolean;
    minFeedbackCount?: number;
    needsLearningRun?: boolean;
}

/**
 * Summary stats for learning data.
 */
export interface LearningStats {
    totalProfiles: number;
    profilesWithLearningEnabled: number;
    totalFeedbackEntries: number;
    totalPatternsDiscovered: number;
    totalPreferencesLearned: number;
    averageAcceptanceRate: number | null;
}

export interface IAgentLearningRepository {
    /**
     * Save or update a learning profile.
     */
    save(profile: IAgentLearningProfile): Promise<void>;

    /**
     * Find profile by ID.
     */
    findById(id: string): Promise<IAgentLearningProfile | null>;

    /**
     * Find profile by agent name.
     */
    findByAgentName(agentName: string): Promise<IAgentLearningProfile | null>;

    /**
     * Get or create a profile for an agent.
     */
    getOrCreate(agentName: string): Promise<IAgentLearningProfile>;

    /**
     * Query profiles with filters.
     */
    query(params: LearningProfileQuery): Promise<IAgentLearningProfile[]>;

    /**
     * Add feedback entry to an agent's profile.
     */
    addFeedback(agentName: string, entry: IFeedbackEntry): Promise<void>;

    /**
     * Add discovered pattern to an agent's profile.
     */
    addPattern(agentName: string, pattern: IFeedbackPattern): Promise<void>;

    /**
     * Update a user preference.
     */
    setPreference(agentName: string, preference: IUserPreference): Promise<void>;

    /**
     * Mark that a learning run was completed.
     */
    markLearningRunCompleted(agentName: string): Promise<void>;

    /**
     * Get learning statistics across all profiles.
     */
    getStats(): Promise<LearningStats>;

    /**
     * Get profiles that need a learning run.
     */
    getProfilesNeedingLearningRun(): Promise<IAgentLearningProfile[]>;

    /**
     * Delete a profile.
     */
    delete(agentName: string): Promise<void>;

    // V8 Adaptive Agents: Suggestion methods

    /**
     * Add a suggested preference change.
     */
    addSuggestedPreference(agentName: string, suggestion: ISuggestedPreference): Promise<void>;

    /**
     * Get all pending suggestions for an agent.
     */
    getPendingSuggestions(agentName: string): Promise<ISuggestedPreference[]>;

    /**
     * Approve a suggestion (updates preference and marks approved).
     */
    approveSuggestion(agentName: string, suggestionId: string, changedBy?: 'user' | 'system' | 'learning'): Promise<void>;

    /**
     * Reject a suggestion.
     */
    rejectSuggestion(agentName: string, suggestionId: string): Promise<void>;

    // V8 Adaptive Agents: Audit and rollback methods

    /**
     * Get the preference change history for an agent.
     */
    getPreferenceHistory(agentName: string, limit?: number): Promise<IPreferenceChangeRecord[]>;

    /**
     * Reset all preferences for an agent to defaults.
     */
    resetAllPreferences(agentName: string, changedBy?: 'user' | 'system' | 'learning'): Promise<void>;

    /**
     * Reset a specific preference to its default value.
     */
    resetPreference(agentName: string, category: string, key: string, changedBy?: 'user' | 'system' | 'learning'): Promise<void>;

    /**
     * Rollback to a previous preference state.
     */
    rollbackToChange(agentName: string, changeId: string): Promise<void>;
}
