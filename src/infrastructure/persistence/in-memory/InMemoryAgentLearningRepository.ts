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
    AgentLearningProfileBuilder,
    AgentLearningProfileUtils,
} from '../../../domain/entities/AgentLearningProfile.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

export class InMemoryAgentLearningRepository implements IAgentLearningRepository {
    private profiles: Map<string, IAgentLearningProfile> = new Map();
    private byAgentName: Map<string, string> = new Map(); // agentName -> id

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

    async setPreference(agentName: string, preference: IUserPreference): Promise<void> {
        const profile = await this.getOrCreate(agentName);

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

        await this.save({
            ...profile,
            preferences: updatedPreferences,
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
