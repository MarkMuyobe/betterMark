/**
 * AdminMetrics - V14 Admin-specific metrics helpers.
 *
 * Provides convenient methods for tracking admin API metrics.
 */

import { IMetricsCollector, MetricLabels } from './MetricsCollector.js';

/**
 * Standard metric names for the admin API.
 */
export const METRIC_NAMES = {
    HTTP_REQUESTS_TOTAL: 'http_requests_total',
    HTTP_REQUEST_DURATION_MS: 'http_request_duration_ms',
    AUTH_FAILURES_TOTAL: 'auth_failures_total',
    MUTATION_ACTIONS_TOTAL: 'mutation_actions_total',
    ROLLBACK_COUNT: 'rollback_count',
    CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',
    CIRCUIT_BREAKER_FAILURES: 'circuit_breaker_failures',
    IDEMPOTENCY_CACHE_HITS: 'idempotency_cache_hits',
    VALIDATION_ERRORS_TOTAL: 'validation_errors_total',
} as const;

/**
 * Admin metrics helper class.
 */
export class AdminMetrics {
    constructor(private readonly metrics: IMetricsCollector) {}

    /**
     * Record an HTTP request.
     */
    recordRequest(method: string, route: string, status: number, durationMs: number): void {
        const labels: MetricLabels = { method, route: this.normalizeRoute(route), status: status.toString() };

        // Increment request counter
        this.metrics.incrementCounter(METRIC_NAMES.HTTP_REQUESTS_TOTAL, 1, labels);

        // Record duration histogram
        this.metrics.recordHistogram(METRIC_NAMES.HTTP_REQUEST_DURATION_MS, durationMs, {
            method,
            route: this.normalizeRoute(route),
        });
    }

    /**
     * Record an authentication failure.
     */
    recordAuthFailure(reason: 'missing' | 'invalid' | 'expired' | 'forbidden'): void {
        this.metrics.incrementCounter(METRIC_NAMES.AUTH_FAILURES_TOTAL, 1, { reason });
    }

    /**
     * Record a mutation action.
     */
    recordMutationAction(action: string): void {
        this.metrics.incrementCounter(METRIC_NAMES.MUTATION_ACTIONS_TOTAL, 1, { action });
    }

    /**
     * Record a rollback operation.
     */
    recordRollback(type: 'preference' | 'arbitration'): void {
        this.metrics.incrementCounter(METRIC_NAMES.ROLLBACK_COUNT, 1, { type });
    }

    /**
     * Record circuit breaker state change.
     */
    recordCircuitBreakerState(service: string, state: 'closed' | 'open' | 'half_open'): void {
        // Use gauge with numeric values: closed=0, half_open=1, open=2
        const value = state === 'closed' ? 0 : state === 'half_open' ? 1 : 2;
        this.metrics.setGauge(METRIC_NAMES.CIRCUIT_BREAKER_STATE, value, { service });
    }

    /**
     * Record circuit breaker failure.
     */
    recordCircuitBreakerFailure(service: string): void {
        this.metrics.incrementCounter(METRIC_NAMES.CIRCUIT_BREAKER_FAILURES, 1, { service });
    }

    /**
     * Record idempotency cache hit.
     */
    recordIdempotencyCacheHit(): void {
        this.metrics.incrementCounter(METRIC_NAMES.IDEMPOTENCY_CACHE_HITS);
    }

    /**
     * Record validation error.
     */
    recordValidationError(route: string): void {
        this.metrics.incrementCounter(METRIC_NAMES.VALIDATION_ERRORS_TOTAL, 1, {
            route: this.normalizeRoute(route),
        });
    }

    /**
     * Start a request timer.
     */
    startRequestTimer(method: string, route: string): () => number {
        return this.metrics.startTimer(METRIC_NAMES.HTTP_REQUEST_DURATION_MS, {
            method,
            route: this.normalizeRoute(route),
        });
    }

    /**
     * Normalize route for metrics labels.
     * Replaces dynamic path parameters with placeholders.
     */
    private normalizeRoute(route: string): string {
        return route
            // Remove query string
            .split('?')[0]
            // Replace UUIDs with :id
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
            // Replace other IDs (alphanumeric with dashes)
            .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:id');
    }
}
