/**
 * AgentPolicy - Value object defining governance rules for agent behavior.
 *
 * Policies are immutable and define constraints on:
 * - How many suggestions an agent can make per event
 * - Minimum confidence threshold for AI-generated responses
 * - Cooldown period between actions on the same aggregate
 * - Whether AI is enabled or rule-based only
 */
export interface IAgentPolicy {
    readonly agentName: string;
    readonly maxSuggestionsPerEvent: number;
    readonly confidenceThreshold: number; // 0.0 to 1.0
    readonly cooldownMs: number; // Minimum time between actions on same aggregate
    readonly aiEnabled: boolean;
    readonly fallbackToRules: boolean; // If AI fails, use rule-based logic
}

export class AgentPolicy implements IAgentPolicy {
    readonly agentName: string;
    readonly maxSuggestionsPerEvent: number;
    readonly confidenceThreshold: number;
    readonly cooldownMs: number;
    readonly aiEnabled: boolean;
    readonly fallbackToRules: boolean;

    private constructor(props: IAgentPolicy) {
        this.agentName = props.agentName;
        this.maxSuggestionsPerEvent = props.maxSuggestionsPerEvent;
        this.confidenceThreshold = props.confidenceThreshold;
        this.cooldownMs = props.cooldownMs;
        this.aiEnabled = props.aiEnabled;
        this.fallbackToRules = props.fallbackToRules;
    }

    static create(props: Partial<IAgentPolicy> & { agentName: string }): AgentPolicy {
        return new AgentPolicy({
            agentName: props.agentName,
            maxSuggestionsPerEvent: props.maxSuggestionsPerEvent ?? 3,
            confidenceThreshold: props.confidenceThreshold ?? 0.7,
            cooldownMs: props.cooldownMs ?? 60000, // 1 minute default
            aiEnabled: props.aiEnabled ?? true,
            fallbackToRules: props.fallbackToRules ?? true,
        });
    }

    /**
     * Default conservative policy - rule-based only
     */
    static conservative(agentName: string): AgentPolicy {
        return AgentPolicy.create({
            agentName,
            maxSuggestionsPerEvent: 1,
            confidenceThreshold: 0.9,
            cooldownMs: 300000, // 5 minutes
            aiEnabled: false,
            fallbackToRules: true,
        });
    }

    /**
     * Default permissive policy - AI enabled with fallback
     */
    static permissive(agentName: string): AgentPolicy {
        return AgentPolicy.create({
            agentName,
            maxSuggestionsPerEvent: 5,
            confidenceThreshold: 0.5,
            cooldownMs: 10000, // 10 seconds
            aiEnabled: true,
            fallbackToRules: true,
        });
    }

    isConfidenceSufficient(confidence: number): boolean {
        return confidence >= this.confidenceThreshold;
    }

    canUseAi(): boolean {
        return this.aiEnabled;
    }

    shouldFallbackToRules(): boolean {
        return this.fallbackToRules;
    }
}
