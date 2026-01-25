/**
 * CircuitBreakerConfig - V14 Circuit breaker configuration types.
 *
 * Defines configuration options for circuit breaker behavior.
 */

/**
 * Circuit breaker states.
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
    /** Name of the service being protected */
    name: string;

    /** Number of consecutive failures before opening the circuit */
    failureThreshold: number;

    /** Time in ms to wait before transitioning from open to half-open */
    recoveryTimeoutMs: number;

    /** Number of successful requests in half-open state before closing */
    halfOpenSuccessThreshold: number;

    /** Number of requests to allow in half-open state */
    halfOpenRequestLimit: number;

    /** Function to determine if an error should trip the breaker */
    shouldTrip?: (error: Error) => boolean;

    /** Function to call when state changes */
    onStateChange?: (from: CircuitState, to: CircuitState) => void;

    /** Function to call when circuit opens */
    onOpen?: () => void;

    /** Function to call when circuit closes */
    onClose?: () => void;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
    failureThreshold: 5,
    recoveryTimeoutMs: 30000, // 30 seconds
    halfOpenSuccessThreshold: 2,
    halfOpenRequestLimit: 2,
    shouldTrip: () => true,
};

/**
 * Circuit breaker statistics.
 */
export interface CircuitBreakerStats {
    name: string;
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime?: Date;
    lastSuccessTime?: Date;
    lastStateChangeTime?: Date;
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
}

/**
 * Pre-configured circuit breaker for LLM services.
 */
export const LLM_CIRCUIT_BREAKER_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
    failureThreshold: 5,
    recoveryTimeoutMs: 30000, // 30 seconds
    halfOpenSuccessThreshold: 2,
    halfOpenRequestLimit: 2,
    shouldTrip: (error: Error) => {
        // Don't trip on validation errors, only on service errors
        const message = error.message.toLowerCase();
        return message.includes('timeout') ||
               message.includes('network') ||
               message.includes('service') ||
               message.includes('unavailable') ||
               message.includes('rate limit') ||
               message.includes('500') ||
               message.includes('502') ||
               message.includes('503') ||
               message.includes('504');
    },
};
