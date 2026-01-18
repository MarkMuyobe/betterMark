/**
 * AdaptationPolicyService - V10 service for managing adaptation policies.
 *
 * Manages per-agent policies for controlled auto-adaptation:
 * - Policy CRUD operations
 * - Opt-in/opt-out management
 * - Scope restriction management
 * - Policy evaluation for auto-adaptation decisions
 */

import {
    IAdaptationPolicy,
    AdaptationPolicyBuilder,
    AdaptationPolicyUtils,
    IScopeRestriction,
} from '../../domain/entities/AdaptationPolicy.js';
import { PreferenceRegistry } from '../../domain/services/PreferenceRegistry.js';
import { RiskLevel, AdaptationMode } from '../../domain/value-objects/PreferenceTypes.js';
import { BlockReason } from '../../domain/entities/AutoAdaptationAttempt.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

/**
 * Result of evaluating whether auto-adaptation is allowed.
 */
export interface IAutoAdaptEvaluationResult {
    allowed: boolean;
    blockReason?: BlockReason;
    effectiveConfidenceThreshold: number;
}

/**
 * In-memory repository for adaptation policies.
 */
export interface IAdaptationPolicyRepository {
    findByAgentName(agentName: string): Promise<IAdaptationPolicy | null>;
    save(policy: IAdaptationPolicy): Promise<void>;
    delete(agentName: string): Promise<void>;
    findAll(): Promise<IAdaptationPolicy[]>;
}

/**
 * Simple in-memory implementation of adaptation policy repository.
 */
export class InMemoryAdaptationPolicyRepository implements IAdaptationPolicyRepository {
    private policies: Map<string, IAdaptationPolicy> = new Map();

    async findByAgentName(agentName: string): Promise<IAdaptationPolicy | null> {
        return this.policies.get(agentName) ?? null;
    }

    async save(policy: IAdaptationPolicy): Promise<void> {
        this.policies.set(policy.agentName, policy);
    }

    async delete(agentName: string): Promise<void> {
        this.policies.delete(agentName);
    }

    async findAll(): Promise<IAdaptationPolicy[]> {
        return Array.from(this.policies.values());
    }
}

export class AdaptationPolicyService {
    constructor(
        private readonly policyRepository: IAdaptationPolicyRepository,
        private readonly preferenceRegistry: PreferenceRegistry,
        private readonly observability?: IObservabilityContext
    ) {}

    /**
     * Get or create a policy for an agent.
     * Default policy is manual (opt-in required).
     */
    async getOrCreatePolicy(agentName: string): Promise<IAdaptationPolicy> {
        let policy = await this.policyRepository.findByAgentName(agentName);

        if (!policy) {
            policy = AdaptationPolicyBuilder.conservative(
                IdGenerator.generate(),
                agentName
            );
            await this.policyRepository.save(policy);

            this.observability?.logger?.info('Created default adaptation policy', {
                agentName,
                policyId: policy.id,
            });
        }

        return policy;
    }

    /**
     * Enable auto-adaptation for an agent (user opt-in).
     */
    async enableAutoAdaptation(
        agentName: string,
        options?: {
            minConfidence?: number;
            allowedRiskLevels?: RiskLevel[];
            cooldownMs?: number;
        }
    ): Promise<IAdaptationPolicy> {
        const policy = await this.getOrCreatePolicy(agentName);

        const updatedPolicy: IAdaptationPolicy = {
            ...policy,
            mode: 'auto',
            userOptedIn: true,
            minConfidence: options?.minConfidence ?? policy.minConfidence,
            allowedRiskLevels: options?.allowedRiskLevels ?? policy.allowedRiskLevels,
            cooldownMs: options?.cooldownMs ?? policy.cooldownMs,
            updatedAt: new Date(),
        };

        await this.policyRepository.save(updatedPolicy);

        this.observability?.logger?.info('Enabled auto-adaptation', {
            agentName,
            minConfidence: updatedPolicy.minConfidence,
            allowedRiskLevels: updatedPolicy.allowedRiskLevels,
        });

        this.observability?.metrics?.incrementCounter('adaptation.policy.enabled', 1, {
            agent: agentName,
        });

        return updatedPolicy;
    }

    /**
     * Disable auto-adaptation for an agent (user opt-out).
     */
    async disableAutoAdaptation(agentName: string): Promise<IAdaptationPolicy> {
        const policy = await this.getOrCreatePolicy(agentName);

        const updatedPolicy: IAdaptationPolicy = {
            ...policy,
            mode: 'manual',
            userOptedIn: false,
            updatedAt: new Date(),
        };

        await this.policyRepository.save(updatedPolicy);

        this.observability?.logger?.info('Disabled auto-adaptation', { agentName });

        this.observability?.metrics?.incrementCounter('adaptation.policy.disabled', 1, {
            agent: agentName,
        });

        return updatedPolicy;
    }

    /**
     * Lock a specific preference from any changes.
     */
    async lockPreference(
        agentName: string,
        category: string,
        key: string
    ): Promise<IAdaptationPolicy> {
        const policy = await this.getOrCreatePolicy(agentName);

        // Remove existing restriction for this preference
        const filteredRestrictions = policy.scopeRestrictions.filter(
            r => !(r.category === category && r.key === key)
        );

        const updatedPolicy: IAdaptationPolicy = {
            ...policy,
            scopeRestrictions: [
                ...filteredRestrictions,
                { category, key, mode: 'manual', locked: true },
            ],
            updatedAt: new Date(),
        };

        await this.policyRepository.save(updatedPolicy);

        this.observability?.logger?.info('Locked preference', {
            agentName,
            preference: `${category}.${key}`,
        });

        return updatedPolicy;
    }

    /**
     * Unlock a preference (remove lock restriction).
     */
    async unlockPreference(
        agentName: string,
        category: string,
        key: string
    ): Promise<IAdaptationPolicy> {
        const policy = await this.getOrCreatePolicy(agentName);

        const filteredRestrictions = policy.scopeRestrictions.filter(
            r => !(r.category === category && r.key === key && r.locked)
        );

        const updatedPolicy: IAdaptationPolicy = {
            ...policy,
            scopeRestrictions: filteredRestrictions,
            updatedAt: new Date(),
        };

        await this.policyRepository.save(updatedPolicy);

        this.observability?.logger?.info('Unlocked preference', {
            agentName,
            preference: `${category}.${key}`,
        });

        return updatedPolicy;
    }

    /**
     * Set a custom scope restriction for a preference.
     */
    async setScopeRestriction(
        agentName: string,
        restriction: IScopeRestriction
    ): Promise<IAdaptationPolicy> {
        const policy = await this.getOrCreatePolicy(agentName);

        // Remove existing restriction for this preference
        const filteredRestrictions = policy.scopeRestrictions.filter(
            r => !(r.category === restriction.category && r.key === restriction.key)
        );

        const updatedPolicy: IAdaptationPolicy = {
            ...policy,
            scopeRestrictions: [...filteredRestrictions, restriction],
            updatedAt: new Date(),
        };

        await this.policyRepository.save(updatedPolicy);

        this.observability?.logger?.info('Set scope restriction', {
            agentName,
            preference: `${restriction.category}.${restriction.key}`,
            mode: restriction.mode,
        });

        return updatedPolicy;
    }

    /**
     * Evaluate whether auto-adaptation is allowed for a specific suggestion.
     */
    async evaluateAutoAdaptation(
        agentName: string,
        category: string,
        key: string,
        confidence: number,
        riskLevel: RiskLevel
    ): Promise<IAutoAdaptEvaluationResult> {
        const policy = await this.getOrCreatePolicy(agentName);

        // Check 1: Is the preference adaptive in the registry?
        if (!this.preferenceRegistry.isAdaptive(category, key)) {
            return {
                allowed: false,
                blockReason: 'preference_not_adaptive',
                effectiveConfidenceThreshold: 1.0,
            };
        }

        // Check 2: User opt-in
        if (!AdaptationPolicyUtils.isAutoEnabled(policy)) {
            return {
                allowed: false,
                blockReason: policy.userOptedIn ? 'mode_is_manual' : 'user_not_opted_in',
                effectiveConfidenceThreshold: 1.0,
            };
        }

        // Check 3: Preference locked
        if (AdaptationPolicyUtils.isPreferenceLocked(policy, category, key)) {
            return {
                allowed: false,
                blockReason: 'preference_locked',
                effectiveConfidenceThreshold: 1.0,
            };
        }

        // Check 4: Effective mode for this preference
        const effectiveMode = AdaptationPolicyUtils.getEffectiveMode(policy, category, key);
        if (effectiveMode === 'manual') {
            return {
                allowed: false,
                blockReason: 'mode_is_manual',
                effectiveConfidenceThreshold: 1.0,
            };
        }

        // Check 5: Risk level allowed
        if (!AdaptationPolicyUtils.isRiskLevelAllowed(policy, riskLevel)) {
            return {
                allowed: false,
                blockReason: 'risk_level_not_allowed',
                effectiveConfidenceThreshold: 1.0,
            };
        }

        // Check 6: Cooldown
        if (!AdaptationPolicyUtils.isCooldownElapsed(policy)) {
            return {
                allowed: false,
                blockReason: 'cooldown_not_elapsed',
                effectiveConfidenceThreshold: 1.0,
            };
        }

        // Check 7: Rate limit
        if (!AdaptationPolicyUtils.isWithinRateLimit(policy)) {
            return {
                allowed: false,
                blockReason: 'rate_limit_exceeded',
                effectiveConfidenceThreshold: 1.0,
            };
        }

        // Check 8: Confidence threshold
        const effectiveThreshold = AdaptationPolicyUtils.getEffectiveMinConfidence(
            policy,
            category,
            key
        );
        const registryThreshold = this.preferenceRegistry.getConfidenceThreshold(category, key);
        const finalThreshold = Math.max(effectiveThreshold, registryThreshold);

        if (confidence < finalThreshold) {
            return {
                allowed: false,
                blockReason: 'confidence_too_low',
                effectiveConfidenceThreshold: finalThreshold,
            };
        }

        return {
            allowed: true,
            effectiveConfidenceThreshold: finalThreshold,
        };
    }

    /**
     * Record that an auto-adaptation was applied (updates rate limiting).
     */
    async recordAutoAdaptation(agentName: string): Promise<void> {
        const policy = await this.getOrCreatePolicy(agentName);
        const updatedPolicy = AdaptationPolicyUtils.recordAutoAdaptation(policy);
        await this.policyRepository.save(updatedPolicy);

        this.observability?.metrics?.incrementCounter('adaptation.auto_applied', 1, {
            agent: agentName,
        });
    }

    /**
     * Get policy status summary.
     */
    async getPolicyStatus(agentName: string): Promise<{
        enabled: boolean;
        mode: AdaptationMode;
        minConfidence: number;
        allowedRiskLevels: RiskLevel[];
        lockedPreferences: string[];
        cooldownRemaining: number;
        rateLimit: { used: number; max: number; windowMs: number };
    }> {
        const policy = await this.getOrCreatePolicy(agentName);

        const lockedPreferences = policy.scopeRestrictions
            .filter(r => r.locked)
            .map(r => `${r.category}.${r.key}`);

        let cooldownRemaining = 0;
        if (policy.lastAutoAdaptAt) {
            const elapsed = Date.now() - policy.lastAutoAdaptAt.getTime();
            cooldownRemaining = Math.max(0, policy.cooldownMs - elapsed);
        }

        return {
            enabled: AdaptationPolicyUtils.isAutoEnabled(policy),
            mode: policy.mode,
            minConfidence: policy.minConfidence,
            allowedRiskLevels: policy.allowedRiskLevels,
            lockedPreferences,
            cooldownRemaining,
            rateLimit: {
                used: policy.currentWindowCount,
                max: policy.rateLimit.maxChanges,
                windowMs: policy.rateLimit.windowMs,
            },
        };
    }

    /**
     * Get all policies.
     */
    async getAllPolicies(): Promise<IAdaptationPolicy[]> {
        return this.policyRepository.findAll();
    }
}
