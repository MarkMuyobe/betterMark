/**
 * ArbitrationPolicy - V11 entity defining how conflicts are resolved.
 *
 * Policies define the resolution strategy for when multiple agents
 * propose conflicting actions.
 */

import { RiskLevel } from '../value-objects/PreferenceTypes.js';

/**
 * Scope of an arbitration policy.
 */
export type PolicyScope = 'global' | 'agent' | 'preference';

/**
 * Resolution strategy types.
 */
export type ResolutionStrategy = 'priority' | 'weighted' | 'veto' | 'consensus';

/**
 * Weights for weighted scoring strategy.
 */
export interface IStrategyWeights {
    confidence: number;
    cost: number;
    risk: number;
}

/**
 * A veto rule that can block actions.
 */
export interface IVetoRule {
    id: string;
    name: string;
    /** Condition type */
    conditionType: 'riskLevel' | 'costThreshold' | 'agentBlacklist' | 'preferenceBlacklist' | 'custom';
    /** Condition value - interpretation depends on conditionType */
    conditionValue: unknown;
    /** Whether this veto requires human escalation instead of silent block */
    escalateOnVeto: boolean;
}

/**
 * Escalation rule for human approval.
 */
export interface IEscalationRule {
    /** Escalate when risk level is at or above */
    riskThreshold?: RiskLevel;
    /** Escalate when cost exceeds */
    costThreshold?: number;
    /** Escalate when confidence is below */
    confidenceThreshold?: number;
    /** Escalate when multiple agents are in conflict */
    onMultiAgentConflict?: boolean;
    /** Always escalate for these agents */
    alwaysEscalateAgents?: string[];
}

/**
 * An arbitration policy.
 */
export interface IArbitrationPolicy {
    id: string;
    name: string;
    description?: string;

    /** Scope of this policy */
    scope: PolicyScope;
    /** Optional: specific agent this policy applies to (for scope='agent') */
    agentName?: string;
    /** Optional: specific preference key this policy applies to (for scope='preference') */
    preferenceKey?: string;

    /** How conflicts are resolved */
    resolutionStrategy: ResolutionStrategy;

    /** For priority strategy: ordered list of agents (highest priority first) */
    priorityOrder: string[];

    /** For weighted strategy: scoring weights */
    weights: IStrategyWeights;

    /** Rules that can veto actions */
    vetoRules: IVetoRule[];

    /** When to require human approval */
    escalationRule?: IEscalationRule;

    /** Whether this is the default policy */
    isDefault: boolean;

    createdAt: Date;
    updatedAt: Date;
}

/**
 * Builder for ArbitrationPolicy.
 */
export class ArbitrationPolicyBuilder {
    private policy: Partial<IArbitrationPolicy> = {
        scope: 'global',
        resolutionStrategy: 'priority',
        priorityOrder: [],
        weights: { confidence: 1.0, cost: 0.5, risk: 0.5 },
        vetoRules: [],
        isDefault: false,
    };

    static create(): ArbitrationPolicyBuilder {
        return new ArbitrationPolicyBuilder();
    }

    /**
     * Create a default global policy with priority-based resolution.
     */
    static createDefault(id: string): IArbitrationPolicy {
        return ArbitrationPolicyBuilder.create()
            .withId(id)
            .withName('Default Global Policy')
            .withDescription('Default policy using priority-based resolution')
            .withScope('global')
            .withStrategy('priority')
            .withPriorityOrder(['CoachAgent', 'PlannerAgent', 'LoggerAgent'])
            .withDefault(true)
            .build();
    }

    /**
     * Create a weighted scoring policy.
     */
    static createWeighted(
        id: string,
        name: string,
        weights: IStrategyWeights
    ): IArbitrationPolicy {
        return ArbitrationPolicyBuilder.create()
            .withId(id)
            .withName(name)
            .withScope('global')
            .withStrategy('weighted')
            .withWeights(weights)
            .build();
    }

    withId(id: string): this {
        this.policy.id = id;
        return this;
    }

    withName(name: string): this {
        this.policy.name = name;
        return this;
    }

    withDescription(description: string): this {
        this.policy.description = description;
        return this;
    }

    withScope(scope: PolicyScope, target?: { agentName?: string; preferenceKey?: string }): this {
        this.policy.scope = scope;
        if (target?.agentName) this.policy.agentName = target.agentName;
        if (target?.preferenceKey) this.policy.preferenceKey = target.preferenceKey;
        return this;
    }

    withStrategy(strategy: ResolutionStrategy): this {
        this.policy.resolutionStrategy = strategy;
        return this;
    }

    withPriorityOrder(order: string[]): this {
        this.policy.priorityOrder = order;
        return this;
    }

    withWeights(weights: IStrategyWeights): this {
        this.policy.weights = weights;
        return this;
    }

    withVetoRule(rule: IVetoRule): this {
        this.policy.vetoRules = [...(this.policy.vetoRules ?? []), rule];
        return this;
    }

    withEscalationRule(rule: IEscalationRule): this {
        this.policy.escalationRule = rule;
        return this;
    }

    withDefault(isDefault: boolean): this {
        this.policy.isDefault = isDefault;
        return this;
    }

    build(): IArbitrationPolicy {
        if (!this.policy.id || !this.policy.name) {
            throw new Error('ArbitrationPolicy requires id and name');
        }

        const now = new Date();

        return {
            id: this.policy.id,
            name: this.policy.name,
            description: this.policy.description,
            scope: this.policy.scope ?? 'global',
            agentName: this.policy.agentName,
            preferenceKey: this.policy.preferenceKey,
            resolutionStrategy: this.policy.resolutionStrategy ?? 'priority',
            priorityOrder: this.policy.priorityOrder ?? [],
            weights: this.policy.weights ?? { confidence: 1.0, cost: 0.5, risk: 0.5 },
            vetoRules: this.policy.vetoRules ?? [],
            escalationRule: this.policy.escalationRule,
            isDefault: this.policy.isDefault ?? false,
            createdAt: now,
            updatedAt: now,
        };
    }
}

/**
 * Helper functions for working with arbitration policies.
 */
export const ArbitrationPolicyUtils = {
    /**
     * Check if a policy applies to a given context.
     */
    appliesTo(
        policy: IArbitrationPolicy,
        agentName: string,
        preferenceKey?: string
    ): boolean {
        switch (policy.scope) {
            case 'global':
                return true;
            case 'agent':
                return policy.agentName === agentName;
            case 'preference':
                return policy.preferenceKey === preferenceKey;
            default:
                return false;
        }
    },

    /**
     * Calculate weighted score for a proposal.
     */
    calculateScore(
        weights: IStrategyWeights,
        confidence: number,
        cost: number,
        riskLevel: RiskLevel
    ): number {
        const riskValue = riskLevel === 'low' ? 0.2 : riskLevel === 'medium' ? 0.5 : 1.0;
        return (confidence * weights.confidence) - (cost * weights.cost) - (riskValue * weights.risk);
    },

    /**
     * Get priority for an agent.
     */
    getAgentPriority(policy: IArbitrationPolicy, agentName: string): number {
        const index = policy.priorityOrder.indexOf(agentName);
        // Lower index = higher priority. If not in list, lowest priority.
        return index >= 0 ? index : policy.priorityOrder.length;
    },

    /**
     * Check if any veto rule matches.
     */
    checkVetoRules(
        policy: IArbitrationPolicy,
        agentName: string,
        cost: number,
        riskLevel: RiskLevel,
        preferenceKey?: string
    ): { vetoed: boolean; rule?: IVetoRule } {
        for (const rule of policy.vetoRules) {
            let matches = false;

            switch (rule.conditionType) {
                case 'riskLevel':
                    matches = riskLevel === rule.conditionValue ||
                        (rule.conditionValue === 'medium' && riskLevel === 'high') ||
                        (rule.conditionValue === 'low' && riskLevel !== 'low');
                    break;
                case 'costThreshold':
                    matches = cost >= (rule.conditionValue as number);
                    break;
                case 'agentBlacklist':
                    matches = (rule.conditionValue as string[]).includes(agentName);
                    break;
                case 'preferenceBlacklist':
                    matches = preferenceKey !== undefined &&
                        (rule.conditionValue as string[]).includes(preferenceKey);
                    break;
            }

            if (matches) {
                return { vetoed: true, rule };
            }
        }

        return { vetoed: false };
    },

    /**
     * Check if escalation is required.
     */
    requiresEscalation(
        policy: IArbitrationPolicy,
        agentName: string,
        confidence: number,
        cost: number,
        riskLevel: RiskLevel,
        isMultiAgentConflict: boolean
    ): boolean {
        const rule = policy.escalationRule;
        if (!rule) return false;

        if (rule.alwaysEscalateAgents?.includes(agentName)) return true;
        if (rule.onMultiAgentConflict && isMultiAgentConflict) return true;

        if (rule.riskThreshold) {
            const riskOrder: RiskLevel[] = ['low', 'medium', 'high'];
            if (riskOrder.indexOf(riskLevel) >= riskOrder.indexOf(rule.riskThreshold)) {
                return true;
            }
        }

        if (rule.costThreshold !== undefined && cost >= rule.costThreshold) return true;
        if (rule.confidenceThreshold !== undefined && confidence < rule.confidenceThreshold) return true;

        return false;
    },
};
