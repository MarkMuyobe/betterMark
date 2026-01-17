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
}
