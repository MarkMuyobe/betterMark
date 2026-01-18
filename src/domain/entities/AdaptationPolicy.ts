/**
 * AdaptationPolicy - V10 Controlled Adaptation policy entity.
 *
 * Defines per-agent policies for automatic preference adaptation.
 * Policies control:
 * - Whether auto-adaptation is enabled (opt-in)
 * - Rate limits and cooldowns
 * - Confidence thresholds
 * - Scope restrictions
 */

import { AdaptationMode, RiskLevel } from '../value-objects/PreferenceTypes.js';

/**
 * Policy scope restriction for a specific preference.
 */
export interface IScopeRestriction {
    category: string;
    key: string;
    /** Override adaptation mode for this preference */
    mode: AdaptationMode;
    /** Override minimum confidence for this preference */
    minConfidence?: number;
    /** Lock this preference from any changes (user or system) */
    locked?: boolean;
}

/**
 * Rate limit configuration.
 */
export interface IRateLimit {
    /** Maximum auto-adaptations per time window */
    maxChanges: number;
    /** Time window in milliseconds */
    windowMs: number;
}

/**
 * Adaptation policy for an agent.
 */
export interface IAdaptationPolicy {
    id: string;
    agentName: string;
    createdAt: Date;
    updatedAt: Date;

    /** Global adaptation mode for this agent */
    mode: AdaptationMode;

    /** Whether the user has explicitly opted in to auto-adaptation */
    userOptedIn: boolean;

    /** Minimum confidence threshold (0-1) for auto-adaptation */
    minConfidence: number;

    /** Cooldown between auto-adaptations (milliseconds) */
    cooldownMs: number;

    /** Rate limiting configuration */
    rateLimit: IRateLimit;

    /** Scope-specific restrictions */
    scopeRestrictions: IScopeRestriction[];

    /** Risk levels that are allowed for auto-adaptation */
    allowedRiskLevels: RiskLevel[];

    /** Last time an auto-adaptation was applied */
    lastAutoAdaptAt: Date | null;

    /** Count of auto-adaptations in current rate limit window */
    currentWindowCount: number;

    /** Start of current rate limit window */
    currentWindowStart: Date | null;
}

/**
 * Builder for AdaptationPolicy.
 */
export class AdaptationPolicyBuilder {
    private policy: Partial<IAdaptationPolicy> = {
        mode: 'manual',
        userOptedIn: false,
        minConfidence: 0.8,
        cooldownMs: 60000, // 1 minute default
        rateLimit: { maxChanges: 5, windowMs: 3600000 }, // 5 per hour
        scopeRestrictions: [],
        allowedRiskLevels: ['low'], // Only low-risk by default
        lastAutoAdaptAt: null,
        currentWindowCount: 0,
        currentWindowStart: null,
    };

    static create(): AdaptationPolicyBuilder {
        return new AdaptationPolicyBuilder();
    }

    /**
     * Create a conservative policy (manual only).
     */
    static conservative(id: string, agentName: string): IAdaptationPolicy {
        return AdaptationPolicyBuilder.create()
            .withId(id)
            .withAgentName(agentName)
            .withMode('manual')
            .withUserOptedIn(false)
            .build();
    }

    /**
     * Create a permissive policy (auto-enabled for low risk).
     */
    static permissive(id: string, agentName: string): IAdaptationPolicy {
        return AdaptationPolicyBuilder.create()
            .withId(id)
            .withAgentName(agentName)
            .withMode('auto')
            .withUserOptedIn(true)
            .withMinConfidence(0.7)
            .withAllowedRiskLevels(['low', 'medium'])
            .build();
    }

    withId(id: string): this {
        this.policy.id = id;
        return this;
    }

    withAgentName(agentName: string): this {
        this.policy.agentName = agentName;
        return this;
    }

    withMode(mode: AdaptationMode): this {
        this.policy.mode = mode;
        return this;
    }

    withUserOptedIn(optedIn: boolean): this {
        this.policy.userOptedIn = optedIn;
        return this;
    }

    withMinConfidence(confidence: number): this {
        this.policy.minConfidence = Math.max(0, Math.min(1, confidence));
        return this;
    }

    withCooldownMs(cooldownMs: number): this {
        this.policy.cooldownMs = cooldownMs;
        return this;
    }

    withRateLimit(rateLimit: IRateLimit): this {
        this.policy.rateLimit = rateLimit;
        return this;
    }

    withScopeRestriction(restriction: IScopeRestriction): this {
        this.policy.scopeRestrictions = [
            ...(this.policy.scopeRestrictions ?? []),
            restriction,
        ];
        return this;
    }

    withAllowedRiskLevels(levels: RiskLevel[]): this {
        this.policy.allowedRiskLevels = levels;
        return this;
    }

    build(): IAdaptationPolicy {
        if (!this.policy.id || !this.policy.agentName) {
            throw new Error('AdaptationPolicy requires id and agentName');
        }

        const now = new Date();

        return {
            id: this.policy.id,
            agentName: this.policy.agentName,
            createdAt: now,
            updatedAt: now,
            mode: this.policy.mode ?? 'manual',
            userOptedIn: this.policy.userOptedIn ?? false,
            minConfidence: this.policy.minConfidence ?? 0.8,
            cooldownMs: this.policy.cooldownMs ?? 60000,
            rateLimit: this.policy.rateLimit ?? { maxChanges: 5, windowMs: 3600000 },
            scopeRestrictions: this.policy.scopeRestrictions ?? [],
            allowedRiskLevels: this.policy.allowedRiskLevels ?? ['low'],
            lastAutoAdaptAt: this.policy.lastAutoAdaptAt ?? null,
            currentWindowCount: this.policy.currentWindowCount ?? 0,
            currentWindowStart: this.policy.currentWindowStart ?? null,
        };
    }
}

/**
 * Helper functions for working with adaptation policies.
 */
export const AdaptationPolicyUtils = {
    /**
     * Check if auto-adaptation is enabled for this policy.
     */
    isAutoEnabled(policy: IAdaptationPolicy): boolean {
        return policy.mode === 'auto' && policy.userOptedIn;
    },

    /**
     * Check if cooldown has elapsed since last auto-adaptation.
     */
    isCooldownElapsed(policy: IAdaptationPolicy): boolean {
        if (!policy.lastAutoAdaptAt) return true;
        const elapsed = Date.now() - policy.lastAutoAdaptAt.getTime();
        return elapsed >= policy.cooldownMs;
    },

    /**
     * Check if rate limit allows another auto-adaptation.
     */
    isWithinRateLimit(policy: IAdaptationPolicy): boolean {
        if (!policy.currentWindowStart) return true;

        const now = Date.now();
        const windowElapsed = now - policy.currentWindowStart.getTime();

        // Window expired, reset count
        if (windowElapsed >= policy.rateLimit.windowMs) {
            return true;
        }

        return policy.currentWindowCount < policy.rateLimit.maxChanges;
    },

    /**
     * Check if a risk level is allowed.
     */
    isRiskLevelAllowed(policy: IAdaptationPolicy, riskLevel: RiskLevel): boolean {
        return policy.allowedRiskLevels.includes(riskLevel);
    },

    /**
     * Get scope restriction for a preference (if any).
     */
    getScopeRestriction(
        policy: IAdaptationPolicy,
        category: string,
        key: string
    ): IScopeRestriction | null {
        return policy.scopeRestrictions.find(
            r => r.category === category && r.key === key
        ) ?? null;
    },

    /**
     * Check if a preference is locked.
     */
    isPreferenceLocked(
        policy: IAdaptationPolicy,
        category: string,
        key: string
    ): boolean {
        const restriction = AdaptationPolicyUtils.getScopeRestriction(policy, category, key);
        return restriction?.locked ?? false;
    },

    /**
     * Get effective mode for a preference (considering scope restrictions).
     */
    getEffectiveMode(
        policy: IAdaptationPolicy,
        category: string,
        key: string
    ): AdaptationMode {
        const restriction = AdaptationPolicyUtils.getScopeRestriction(policy, category, key);
        if (restriction?.locked) return 'manual';
        return restriction?.mode ?? policy.mode;
    },

    /**
     * Get effective minimum confidence for a preference.
     */
    getEffectiveMinConfidence(
        policy: IAdaptationPolicy,
        category: string,
        key: string
    ): number {
        const restriction = AdaptationPolicyUtils.getScopeRestriction(policy, category, key);
        return restriction?.minConfidence ?? policy.minConfidence;
    },

    /**
     * Record an auto-adaptation (updates rate limiting state).
     */
    recordAutoAdaptation(policy: IAdaptationPolicy): IAdaptationPolicy {
        const now = new Date();

        // Check if we need to start a new window
        let newWindowStart = policy.currentWindowStart;
        let newWindowCount = policy.currentWindowCount;

        if (!policy.currentWindowStart) {
            newWindowStart = now;
            newWindowCount = 1;
        } else {
            const windowElapsed = now.getTime() - policy.currentWindowStart.getTime();
            if (windowElapsed >= policy.rateLimit.windowMs) {
                // Start new window
                newWindowStart = now;
                newWindowCount = 1;
            } else {
                // Increment in current window
                newWindowCount = policy.currentWindowCount + 1;
            }
        }

        return {
            ...policy,
            lastAutoAdaptAt: now,
            currentWindowStart: newWindowStart,
            currentWindowCount: newWindowCount,
            updatedAt: now,
        };
    },
};
