import { AgentPolicy } from '../../domain/value-objects/AgentPolicy.js';
import { IAgentGovernanceMetadata, ReasoningSource } from '../../domain/entities/AgentActionLog.js';
import { ILlmService, LlmResponse, LlmOptions } from '../ports/ILlmService.js';
import { PromptBuilder, PromptContext } from '../ai/PromptTemplates.js';

/**
 * Result of a governed AI generation request
 */
export interface GovernedResponse {
    content: string;
    reasoningSource: ReasoningSource;
    governance: IAgentGovernanceMetadata;
}

/**
 * Fallback function type for rule-based responses
 */
export type FallbackFn = () => string;

/**
 * AgentGovernanceService - Central service for agent policy enforcement.
 *
 * Responsibilities:
 * - Manage agent policies
 * - Enforce rate limits and cooldowns
 * - Track AI usage per agent/aggregate
 * - Handle AI calls with fallback behavior
 * - Provide observability metadata
 *
 * This service sits in the Application layer and is injected into agent handlers.
 * It does NOT mutate domain entities.
 */
export class AgentGovernanceService {
    private policies: Map<string, AgentPolicy> = new Map();
    private cooldowns: Map<string, Date> = new Map(); // key: agentName:aggregateId
    private suggestionCounts: Map<string, number> = new Map(); // key: agentName:eventId
    private promptBuilder: PromptBuilder;

    constructor(
        private llmService: ILlmService,
        promptBuilder?: PromptBuilder
    ) {
        this.promptBuilder = promptBuilder ?? new PromptBuilder();
    }

    /**
     * Registers a policy for an agent.
     */
    registerPolicy(policy: AgentPolicy): void {
        this.policies.set(policy.agentName, policy);
    }

    /**
     * Gets the policy for an agent, or creates a default one.
     */
    getPolicy(agentName: string): AgentPolicy {
        return this.policies.get(agentName) ?? AgentPolicy.create({ agentName });
    }

    /**
     * Checks if an agent can take action based on cooldown.
     */
    canTakeAction(agentName: string, aggregateId: string): boolean {
        const policy = this.getPolicy(agentName);
        const key = `${agentName}:${aggregateId}`;
        const lastAction = this.cooldowns.get(key);

        if (!lastAction) {
            return true;
        }

        const elapsed = Date.now() - lastAction.getTime();
        return elapsed >= policy.cooldownMs;
    }

    /**
     * Records that an action was taken, for cooldown tracking.
     */
    recordAction(agentName: string, aggregateId: string): void {
        const key = `${agentName}:${aggregateId}`;
        this.cooldowns.set(key, new Date());
    }

    /**
     * Checks if more suggestions are allowed for this event.
     */
    canMakeSuggestion(agentName: string, eventId: string): boolean {
        const policy = this.getPolicy(agentName);
        const key = `${agentName}:${eventId}`;
        const count = this.suggestionCounts.get(key) ?? 0;
        return count < policy.maxSuggestionsPerEvent;
    }

    /**
     * Records a suggestion for rate limiting.
     */
    recordSuggestion(agentName: string, eventId: string): void {
        const key = `${agentName}:${eventId}`;
        const count = this.suggestionCounts.get(key) ?? 0;
        this.suggestionCounts.set(key, count + 1);
    }

    /**
     * Generates a response using AI with policy enforcement and fallback.
     *
     * @param agentName - The agent requesting generation
     * @param templateName - The prompt template to use
     * @param context - Context values for the template
     * @param fallbackFn - Rule-based fallback function
     * @param options - Optional LLM generation options
     */
    async generateWithGovernance(
        agentName: string,
        templateName: string,
        context: PromptContext,
        fallbackFn: FallbackFn,
        options?: LlmOptions
    ): Promise<GovernedResponse> {
        const policy = this.getPolicy(agentName);
        const startTime = Date.now();

        // If AI is disabled, use fallback immediately
        if (!policy.canUseAi()) {
            return this.createFallbackResponse(
                agentName,
                policy,
                fallbackFn(),
                'AI disabled by policy',
                startTime
            );
        }

        try {
            // Build prompt from template
            const prompt = this.promptBuilder.build(templateName, context);

            // Call LLM service
            const llmResponse = await this.llmService.generate(prompt, options);

            // Check confidence threshold
            if (!policy.isConfidenceSufficient(llmResponse.confidence)) {
                if (policy.shouldFallbackToRules()) {
                    return this.createFallbackResponse(
                        agentName,
                        policy,
                        fallbackFn(),
                        `Confidence ${llmResponse.confidence} below threshold ${policy.confidenceThreshold}`,
                        startTime
                    );
                }
            }

            // Return successful AI response
            return {
                content: llmResponse.content,
                reasoningSource: 'llm',
                governance: {
                    policyName: policy.agentName,
                    aiUsed: true,
                    confidence: llmResponse.confidence,
                    latencyMs: llmResponse.latencyMs,
                    costUsd: llmResponse.costUsd,
                    model: llmResponse.model,
                    fallbackTriggered: false,
                    tokens: llmResponse.tokens,
                },
            };

        } catch (error) {
            // AI call failed - use fallback if allowed
            if (policy.shouldFallbackToRules()) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                return this.createFallbackResponse(
                    agentName,
                    policy,
                    fallbackFn(),
                    `AI error: ${errorMessage}`,
                    startTime
                );
            }

            // No fallback allowed - rethrow
            throw error;
        }
    }

    /**
     * Simple generation without templates (for backward compatibility).
     */
    async generateSimple(
        agentName: string,
        prompt: string,
        fallbackFn: FallbackFn,
        options?: LlmOptions
    ): Promise<GovernedResponse> {
        const policy = this.getPolicy(agentName);
        const startTime = Date.now();

        if (!policy.canUseAi()) {
            return this.createFallbackResponse(
                agentName,
                policy,
                fallbackFn(),
                'AI disabled by policy',
                startTime
            );
        }

        try {
            const llmResponse = await this.llmService.generate(prompt, options);

            if (!policy.isConfidenceSufficient(llmResponse.confidence) && policy.shouldFallbackToRules()) {
                return this.createFallbackResponse(
                    agentName,
                    policy,
                    fallbackFn(),
                    `Confidence below threshold`,
                    startTime
                );
            }

            return {
                content: llmResponse.content,
                reasoningSource: 'llm',
                governance: {
                    policyName: policy.agentName,
                    aiUsed: true,
                    confidence: llmResponse.confidence,
                    latencyMs: llmResponse.latencyMs,
                    costUsd: llmResponse.costUsd,
                    model: llmResponse.model,
                    fallbackTriggered: false,
                    tokens: llmResponse.tokens,
                },
            };
        } catch (error) {
            if (policy.shouldFallbackToRules()) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                return this.createFallbackResponse(
                    agentName,
                    policy,
                    fallbackFn(),
                    `AI error: ${errorMessage}`,
                    startTime
                );
            }
            throw error;
        }
    }

    private createFallbackResponse(
        agentName: string,
        policy: AgentPolicy,
        content: string,
        reason: string,
        startTime: number
    ): GovernedResponse {
        return {
            content,
            reasoningSource: 'fallback',
            governance: {
                policyName: policy.agentName,
                aiUsed: false,
                confidence: 1.0, // Rule-based responses have full confidence
                latencyMs: Date.now() - startTime,
                costUsd: 0,
                model: 'rule-based',
                fallbackTriggered: true,
                fallbackReason: reason,
            },
        };
    }

    /**
     * Clears cooldown tracking (useful for testing).
     */
    clearCooldowns(): void {
        this.cooldowns.clear();
    }

    /**
     * Clears suggestion counts (useful for testing).
     */
    clearSuggestionCounts(): void {
        this.suggestionCounts.clear();
    }

    /**
     * Gets LLM service health status.
     */
    async isLlmHealthy(): Promise<boolean> {
        return this.llmService.healthCheck();
    }
}
