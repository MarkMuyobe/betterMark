import { AgentPolicy } from '../../domain/value-objects/AgentPolicy.js';
import { IAgentGovernanceMetadata, ReasoningSource } from '../../domain/entities/AgentActionLog.js';
import { IDecisionRecord, DecisionRecordBuilder, DecisionType, IDecisionAIMetadata } from '../../domain/entities/DecisionRecord.js';
import { ILlmService, LlmResponse, LlmOptions } from '../ports/ILlmService.js';
import { IDecisionRecordRepository } from '../ports/IDecisionRecordRepository.js';
import { PromptBuilder, PromptContext } from '../ai/PromptTemplates.js';
import { IObservabilityContext, MetricNames, SpanNames } from '../ports/IObservabilityContext.js';
import { NullLogger } from '../../infrastructure/observability/Logger.js';
import { NullMetricsCollector } from '../../infrastructure/observability/MetricsCollector.js';
import { NullTracer } from '../../infrastructure/observability/Tracer.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

/**
 * Result of a governed AI generation request
 */
export interface GovernedResponse {
    content: string;
    reasoningSource: ReasoningSource;
    governance: IAgentGovernanceMetadata;
}

/**
 * Result of a governed AI generation with decision record tracking.
 */
export interface GovernedResponseWithDecisionId extends GovernedResponse {
    decisionRecordId: string;
}

/**
 * Event info for creating a decision record.
 */
export interface DecisionEventInfo {
    triggeringEventType: string;
    triggeringEventId: string;
    aggregateType: string;
    aggregateId: string;
    decisionType: DecisionType;
}

/**
 * Fallback function type for rule-based responses
 */
export type FallbackFn = () => string;

/**
 * Creates a null observability context for backward compatibility.
 */
function createNullObservability(): IObservabilityContext {
    return {
        logger: new NullLogger(),
        metrics: new NullMetricsCollector(),
        tracer: new NullTracer(),
    };
}

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
    private observability: IObservabilityContext;
    private decisionRecordRepository: IDecisionRecordRepository | null = null;

    constructor(
        private llmService: ILlmService,
        promptBuilder?: PromptBuilder,
        observability?: IObservabilityContext,
        decisionRecordRepository?: IDecisionRecordRepository
    ) {
        this.promptBuilder = promptBuilder ?? new PromptBuilder();
        this.observability = observability ?? createNullObservability();
        this.decisionRecordRepository = decisionRecordRepository ?? null;
    }

    /**
     * Sets the decision record repository (for late binding).
     */
    setDecisionRecordRepository(repository: IDecisionRecordRepository): void {
        this.decisionRecordRepository = repository;
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
        const { logger, metrics, tracer } = this.observability;
        const policy = this.getPolicy(agentName);
        const startTime = Date.now();

        return tracer.withSpan(SpanNames.AGENT_GENERATE_SUGGESTION, async () => {
            const span = tracer.getCurrentSpan();
            span?.setAttributes({ agentName, templateName });

            // If AI is disabled, use fallback immediately
            if (!policy.canUseAi()) {
                logger.info('AI disabled by policy, using fallback', { agentName });
                metrics.incrementCounter(MetricNames.AGENT_FALLBACKS_TOTAL, 1, { agent: agentName, reason: 'policy_disabled' });
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
                logger.debug('Calling LLM service', { agentName, templateName });
                const timer = metrics.startTimer(MetricNames.AI_LATENCY_MS, { agent: agentName });
                const llmResponse = await this.llmService.generate(prompt, options);
                timer();

                // Track AI metrics
                metrics.incrementCounter(MetricNames.AI_CALLS_TOTAL, 1, { agent: agentName, model: llmResponse.model });
                metrics.incrementCounter(MetricNames.AI_TOKENS_TOTAL, llmResponse.tokens.total, { agent: agentName });
                if (llmResponse.costUsd > 0) {
                    metrics.recordHistogram(MetricNames.AI_COST_USD, llmResponse.costUsd, { agent: agentName });
                }

                // Check confidence threshold
                if (!policy.isConfidenceSufficient(llmResponse.confidence)) {
                    if (policy.shouldFallbackToRules()) {
                        logger.info('Confidence below threshold, using fallback', {
                            agentName,
                            confidence: llmResponse.confidence,
                            threshold: policy.confidenceThreshold,
                        });
                        metrics.incrementCounter(MetricNames.AGENT_FALLBACKS_TOTAL, 1, { agent: agentName, reason: 'low_confidence' });
                        return this.createFallbackResponse(
                            agentName,
                            policy,
                            fallbackFn(),
                            `Confidence ${llmResponse.confidence} below threshold ${policy.confidenceThreshold}`,
                            startTime
                        );
                    }
                }

                logger.info('AI generation successful', { agentName, confidence: llmResponse.confidence, latencyMs: llmResponse.latencyMs });
                span?.setStatus('ok');

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
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('AI generation failed', error as Error, { agentName });
                metrics.incrementCounter(MetricNames.AI_ERRORS_TOTAL, 1, { agent: agentName });
                span?.setStatus('error');

                // AI call failed - use fallback if allowed
                if (policy.shouldFallbackToRules()) {
                    metrics.incrementCounter(MetricNames.AGENT_FALLBACKS_TOTAL, 1, { agent: agentName, reason: 'ai_error' });
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
        });
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

    /**
     * Generates a response with governance AND creates a decision record.
     *
     * This method wraps generateWithGovernance and also persists a DecisionRecord
     * for feedback capture and adaptive learning.
     *
     * @param agentName - The agent requesting generation
     * @param templateName - The prompt template to use
     * @param context - Context values for the template
     * @param fallbackFn - Rule-based fallback function
     * @param eventInfo - Event metadata for the decision record
     * @param options - Optional LLM generation options
     */
    async generateWithDecisionRecord(
        agentName: string,
        templateName: string,
        context: PromptContext,
        fallbackFn: FallbackFn,
        eventInfo: DecisionEventInfo,
        options?: LlmOptions
    ): Promise<GovernedResponseWithDecisionId> {
        // Generate the response using existing governance
        const response = await this.generateWithGovernance(
            agentName,
            templateName,
            context,
            fallbackFn,
            options
        );

        // Create the decision record
        const decisionRecordId = IdGenerator.generate();
        const builder = DecisionRecordBuilder.create()
            .withId(decisionRecordId)
            .withEvent(eventInfo.triggeringEventType, eventInfo.triggeringEventId)
            .withAggregate(eventInfo.aggregateType, eventInfo.aggregateId)
            .withDecision(
                agentName,
                eventInfo.decisionType,
                response.reasoningSource,
                response.content
            );

        // Add AI metadata if AI was used
        if (response.governance.aiUsed && response.governance.tokens) {
            const aiMetadata: IDecisionAIMetadata = {
                model: response.governance.model ?? 'unknown',
                confidence: response.governance.confidence ?? 0,
                promptTokens: response.governance.tokens.prompt,
                completionTokens: response.governance.tokens.completion,
                costUsd: response.governance.costUsd ?? 0,
                latencyMs: response.governance.latencyMs ?? 0,
            };
            builder.withAIMetadata(aiMetadata);
        }

        const decisionRecord = builder.build();

        // Save the decision record if repository is available
        if (this.decisionRecordRepository) {
            await this.decisionRecordRepository.save(decisionRecord);
        }

        return {
            ...response,
            decisionRecordId,
        };
    }

    /**
     * Creates a decision record for a heuristic/rule-based decision (no AI).
     *
     * Use this for agents that don't use AI but still want decision tracking.
     */
    async createDecisionRecord(
        agentName: string,
        content: string,
        reasoningSource: ReasoningSource,
        eventInfo: DecisionEventInfo
    ): Promise<string> {
        const decisionRecordId = IdGenerator.generate();

        const decisionRecord = DecisionRecordBuilder.create()
            .withId(decisionRecordId)
            .withEvent(eventInfo.triggeringEventType, eventInfo.triggeringEventId)
            .withAggregate(eventInfo.aggregateType, eventInfo.aggregateId)
            .withDecision(
                agentName,
                eventInfo.decisionType,
                reasoningSource,
                content
            )
            .build();

        // Save the decision record if repository is available
        if (this.decisionRecordRepository) {
            await this.decisionRecordRepository.save(decisionRecord);
        }

        return decisionRecordId;
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
