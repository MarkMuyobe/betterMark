/**
 * AgentLearningProfile - Tracks agent learning data for V8 adaptive behavior.
 *
 * Stores:
 * - User feedback patterns
 * - Decision outcome history
 * - Context-specific preferences
 * - Performance trends
 *
 * This is a V8 preparation structure - the adaptive learning algorithms
 * will be implemented in V8, but we capture the data now.
 */

/**
 * A single feedback entry.
 */
export interface IFeedbackEntry {
    decisionRecordId: string;
    timestamp: Date;
    decisionType: string;
    userAccepted: boolean | null;
    userFeedback?: string;
    context: Record<string, unknown>; // Contextual data at decision time
}

/**
 * Aggregated pattern from feedback.
 */
export interface IFeedbackPattern {
    patternId: string;
    description: string;
    decisionType: string;
    contextConditions: Record<string, unknown>;
    acceptanceRate: number;
    sampleSize: number;
    confidence: number;
    discoveredAt: Date;
    lastUpdated: Date;
}

/**
 * User preference learned from interactions.
 */
export interface IUserPreference {
    preferenceId: string;
    category: string; // e.g., 'timing', 'verbosity', 'frequency'
    key: string;
    value: unknown;
    confidence: number;
    learnedFrom: string[]; // Decision record IDs that contributed
    lastUpdated: Date;
}

/**
 * Performance trend data point.
 */
export interface IPerformanceTrend {
    periodStart: Date;
    periodEnd: Date;
    metric: string;
    value: number;
    change: number; // Compared to previous period
}

/**
 * Agent learning profile - tracks all learning data for an agent.
 */
export interface IAgentLearningProfile {
    id: string;
    agentName: string;
    createdAt: Date;
    updatedAt: Date;

    // Raw feedback history (most recent N entries)
    feedbackHistory: IFeedbackEntry[];

    // Discovered patterns
    patterns: IFeedbackPattern[];

    // Learned user preferences
    preferences: IUserPreference[];

    // Performance trends
    performanceTrends: IPerformanceTrend[];

    // Aggregate metrics
    totalFeedbackReceived: number;
    overallAcceptanceRate: number | null;
    averageConfidenceWhenAccepted: number;
    averageConfidenceWhenRejected: number;

    // Learning state
    learningEnabled: boolean;
    lastLearningRunAt: Date | null;
    learningVersion: number; // Increments when patterns are updated
}

/**
 * Builder for creating AgentLearningProfile.
 */
export class AgentLearningProfileBuilder {
    private profile: Partial<IAgentLearningProfile> = {
        feedbackHistory: [],
        patterns: [],
        preferences: [],
        performanceTrends: [],
        totalFeedbackReceived: 0,
        overallAcceptanceRate: null,
        averageConfidenceWhenAccepted: 0,
        averageConfidenceWhenRejected: 0,
        learningEnabled: true,
        lastLearningRunAt: null,
        learningVersion: 1,
    };

    static create(): AgentLearningProfileBuilder {
        return new AgentLearningProfileBuilder();
    }

    withId(id: string): this {
        this.profile.id = id;
        return this;
    }

    withAgentName(agentName: string): this {
        this.profile.agentName = agentName;
        return this;
    }

    withFeedbackHistory(history: IFeedbackEntry[]): this {
        this.profile.feedbackHistory = history;
        this.profile.totalFeedbackReceived = history.length;
        return this;
    }

    withPatterns(patterns: IFeedbackPattern[]): this {
        this.profile.patterns = patterns;
        return this;
    }

    withPreferences(preferences: IUserPreference[]): this {
        this.profile.preferences = preferences;
        return this;
    }

    withLearningEnabled(enabled: boolean): this {
        this.profile.learningEnabled = enabled;
        return this;
    }

    build(): IAgentLearningProfile {
        if (!this.profile.id || !this.profile.agentName) {
            throw new Error('AgentLearningProfile requires id and agentName');
        }

        const now = new Date();

        return {
            id: this.profile.id,
            agentName: this.profile.agentName,
            createdAt: now,
            updatedAt: now,
            feedbackHistory: this.profile.feedbackHistory ?? [],
            patterns: this.profile.patterns ?? [],
            preferences: this.profile.preferences ?? [],
            performanceTrends: this.profile.performanceTrends ?? [],
            totalFeedbackReceived: this.profile.totalFeedbackReceived ?? 0,
            overallAcceptanceRate: this.profile.overallAcceptanceRate ?? null,
            averageConfidenceWhenAccepted: this.profile.averageConfidenceWhenAccepted ?? 0,
            averageConfidenceWhenRejected: this.profile.averageConfidenceWhenRejected ?? 0,
            learningEnabled: this.profile.learningEnabled ?? true,
            lastLearningRunAt: this.profile.lastLearningRunAt ?? null,
            learningVersion: this.profile.learningVersion ?? 1,
        };
    }
}

/**
 * Helper functions for working with learning profiles.
 */
export const AgentLearningProfileUtils = {
    /**
     * Add feedback to a profile.
     */
    addFeedback(
        profile: IAgentLearningProfile,
        entry: IFeedbackEntry,
        maxHistorySize: number = 1000
    ): IAgentLearningProfile {
        const updatedHistory = [entry, ...profile.feedbackHistory].slice(0, maxHistorySize);
        const totalFeedback = profile.totalFeedbackReceived + 1;

        // Recalculate acceptance rate
        const acceptedCount = updatedHistory.filter(e => e.userAccepted === true).length;
        const decidedCount = updatedHistory.filter(e => e.userAccepted !== null).length;
        const acceptanceRate = decidedCount > 0 ? acceptedCount / decidedCount : null;

        return {
            ...profile,
            feedbackHistory: updatedHistory,
            totalFeedbackReceived: totalFeedback,
            overallAcceptanceRate: acceptanceRate,
            updatedAt: new Date(),
        };
    },

    /**
     * Check if profile needs a learning run.
     */
    needsLearningRun(
        profile: IAgentLearningProfile,
        minFeedbackSinceLastRun: number = 50,
        maxAgeSinceLastRunMs: number = 24 * 60 * 60 * 1000 // 24 hours
    ): boolean {
        if (!profile.learningEnabled) return false;
        if (!profile.lastLearningRunAt) return profile.totalFeedbackReceived >= minFeedbackSinceLastRun;

        const timeSinceLastRun = Date.now() - profile.lastLearningRunAt.getTime();
        return timeSinceLastRun >= maxAgeSinceLastRunMs;
    },

    /**
     * Get preference value with default.
     */
    getPreference<T>(
        profile: IAgentLearningProfile,
        category: string,
        key: string,
        defaultValue: T
    ): T {
        const pref = profile.preferences.find(p => p.category === category && p.key === key);
        return pref ? (pref.value as T) : defaultValue;
    },

    /**
     * Find applicable patterns for a context.
     */
    findApplicablePatterns(
        profile: IAgentLearningProfile,
        decisionType: string,
        context: Record<string, unknown>,
        minConfidence: number = 0.6
    ): IFeedbackPattern[] {
        return profile.patterns.filter(pattern => {
            if (pattern.decisionType !== decisionType) return false;
            if (pattern.confidence < minConfidence) return false;

            // Check if context matches conditions
            for (const [key, value] of Object.entries(pattern.contextConditions)) {
                if (context[key] !== value) return false;
            }

            return true;
        });
    },
};
