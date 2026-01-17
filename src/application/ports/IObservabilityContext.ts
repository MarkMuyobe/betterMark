/**
 * IObservabilityContext - Bundled observability components.
 *
 * Provides a single injection point for all observability tools:
 * - Logger for structured logging
 * - Metrics for counters, gauges, histograms
 * - Tracer for distributed tracing
 */

import { ILogger } from '../../infrastructure/observability/Logger.js';
import { IMetricsCollector } from '../../infrastructure/observability/MetricsCollector.js';
import { ITracer } from '../../infrastructure/observability/Tracer.js';

export interface IObservabilityContext {
    readonly logger: ILogger;
    readonly metrics: IMetricsCollector;
    readonly tracer: ITracer;
}

/**
 * Standard metric names used across the application.
 */
export const MetricNames = {
    // AI/LLM metrics
    AI_CALLS_TOTAL: 'ai_calls_total',
    AI_ERRORS_TOTAL: 'ai_errors_total',
    AI_LATENCY_MS: 'ai_latency_ms',
    AI_TOKENS_TOTAL: 'ai_tokens_total',
    AI_COST_USD: 'ai_cost_usd',

    // Agent metrics
    AGENT_ACTIONS_TOTAL: 'agent_actions_total',
    AGENT_FALLBACKS_TOTAL: 'agent_fallbacks_total',
    AGENT_SUGGESTIONS_TOTAL: 'agent_suggestions_total',
    AGENT_COOLDOWNS_HIT: 'agent_cooldowns_hit',

    // Event metrics
    EVENTS_DISPATCHED_TOTAL: 'events_dispatched_total',
    EVENTS_HANDLED_TOTAL: 'events_handled_total',

    // Coordination metrics
    CONFLICTS_DETECTED_TOTAL: 'conflicts_detected_total',
    CONFLICTS_RESOLVED_TOTAL: 'conflicts_resolved_total',
    PROPOSED_ACTIONS_TOTAL: 'proposed_actions_total',
} as const;

/**
 * Standard span names used for tracing.
 */
export const SpanNames = {
    // AI operations
    AI_GENERATE: 'ai.generate',
    AI_HEALTH_CHECK: 'ai.health_check',

    // Agent operations
    AGENT_HANDLE_EVENT: 'agent.handle_event',
    AGENT_GENERATE_SUGGESTION: 'agent.generate_suggestion',

    // Event operations
    EVENT_DISPATCH: 'event.dispatch',
    EVENT_HANDLE: 'event.handle',

    // Coordination operations
    COORDINATION_PROPOSE: 'coordination.propose_action',
    COORDINATION_RESOLVE: 'coordination.resolve_conflict',

    // Repository operations
    REPO_FIND: 'repository.find',
    REPO_SAVE: 'repository.save',
} as const;
