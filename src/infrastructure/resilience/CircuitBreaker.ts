/**
 * CircuitBreaker - V14 Generic circuit breaker implementation.
 *
 * Protects against cascading failures by failing fast when a service is unavailable.
 */

import {
    CircuitBreakerConfig,
    CircuitState,
    CircuitBreakerStats,
    DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './CircuitBreakerConfig.js';

/**
 * Error thrown when circuit is open.
 */
export class CircuitOpenError extends Error {
    constructor(public readonly serviceName: string) {
        super(`Circuit breaker is open for service: ${serviceName}`);
        this.name = 'CircuitOpenError';
        Object.setPrototypeOf(this, CircuitOpenError.prototype);
    }
}

/**
 * Circuit breaker implementation.
 */
export class CircuitBreaker {
    private readonly config: CircuitBreakerConfig;
    private state: CircuitState = 'closed';
    private failures = 0;
    private successes = 0;
    private halfOpenRequests = 0;
    private lastFailureTime?: Date;
    private lastSuccessTime?: Date;
    private lastStateChangeTime = new Date();
    private totalRequests = 0;
    private totalFailures = 0;
    private totalSuccesses = 0;

    constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
        this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    }

    /**
     * Get current circuit state.
     */
    getState(): CircuitState {
        this.checkStateTransition();
        return this.state;
    }

    /**
     * Get circuit breaker statistics.
     */
    getStats(): CircuitBreakerStats {
        return {
            name: this.config.name,
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            lastStateChangeTime: this.lastStateChangeTime,
            totalRequests: this.totalRequests,
            totalFailures: this.totalFailures,
            totalSuccesses: this.totalSuccesses,
        };
    }

    /**
     * Execute a function through the circuit breaker.
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        this.checkStateTransition();
        this.totalRequests++;

        if (!this.canExecute()) {
            throw new CircuitOpenError(this.config.name);
        }

        if (this.state === 'half_open') {
            this.halfOpenRequests++;
        }

        try {
            const result = await fn();
            this.recordSuccess();
            return result;
        } catch (error) {
            this.recordFailure(error as Error);
            throw error;
        }
    }

    /**
     * Execute with a fallback function when circuit is open.
     */
    async executeWithFallback<T>(
        fn: () => Promise<T>,
        fallback: () => T | Promise<T>
    ): Promise<T> {
        try {
            return await this.execute(fn);
        } catch (error) {
            if (error instanceof CircuitOpenError) {
                return await fallback();
            }
            throw error;
        }
    }

    /**
     * Check if execution is allowed.
     */
    canExecute(): boolean {
        this.checkStateTransition();

        switch (this.state) {
            case 'closed':
                return true;
            case 'open':
                return false;
            case 'half_open':
                return this.halfOpenRequests < this.config.halfOpenRequestLimit;
        }
    }

    /**
     * Record a successful execution.
     */
    private recordSuccess(): void {
        this.lastSuccessTime = new Date();
        this.totalSuccesses++;
        this.successes++;

        if (this.state === 'half_open') {
            if (this.successes >= this.config.halfOpenSuccessThreshold) {
                this.transitionTo('closed');
            }
        } else if (this.state === 'closed') {
            // Reset failure count on success in closed state
            this.failures = 0;
        }
    }

    /**
     * Record a failed execution.
     */
    private recordFailure(error: Error): void {
        this.lastFailureTime = new Date();
        this.totalFailures++;

        // Check if this error should trip the breaker
        const shouldTrip = this.config.shouldTrip?.(error) ?? true;
        if (!shouldTrip) {
            return;
        }

        this.failures++;

        if (this.state === 'half_open') {
            // Any failure in half-open goes back to open
            this.transitionTo('open');
        } else if (this.state === 'closed') {
            if (this.failures >= this.config.failureThreshold) {
                this.transitionTo('open');
            }
        }
    }

    /**
     * Check and perform state transitions based on time.
     */
    private checkStateTransition(): void {
        if (this.state === 'open') {
            const timeSinceOpen = Date.now() - this.lastStateChangeTime.getTime();
            if (timeSinceOpen >= this.config.recoveryTimeoutMs) {
                this.transitionTo('half_open');
            }
        }
    }

    /**
     * Transition to a new state.
     */
    private transitionTo(newState: CircuitState): void {
        if (this.state === newState) return;

        const oldState = this.state;
        this.state = newState;
        this.lastStateChangeTime = new Date();

        // Reset counters based on state
        switch (newState) {
            case 'closed':
                this.failures = 0;
                this.successes = 0;
                this.config.onClose?.();
                break;
            case 'open':
                this.successes = 0;
                this.halfOpenRequests = 0;
                this.config.onOpen?.();
                break;
            case 'half_open':
                this.successes = 0;
                this.failures = 0;
                this.halfOpenRequests = 0;
                break;
        }

        this.config.onStateChange?.(oldState, newState);
    }

    /**
     * Force the circuit to open (for testing or manual intervention).
     */
    forceOpen(): void {
        this.transitionTo('open');
    }

    /**
     * Force the circuit to close (for testing or manual intervention).
     */
    forceClose(): void {
        this.transitionTo('closed');
    }

    /**
     * Reset the circuit breaker to initial state.
     */
    reset(): void {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
        this.halfOpenRequests = 0;
        this.lastFailureTime = undefined;
        this.lastSuccessTime = undefined;
        this.lastStateChangeTime = new Date();
        this.totalRequests = 0;
        this.totalFailures = 0;
        this.totalSuccesses = 0;
    }
}

/**
 * Circuit breaker registry for managing multiple breakers.
 */
export class CircuitBreakerRegistry {
    private breakers: Map<string, CircuitBreaker> = new Map();

    /**
     * Get or create a circuit breaker.
     */
    getOrCreate(config: Partial<CircuitBreakerConfig> & { name: string }): CircuitBreaker {
        let breaker = this.breakers.get(config.name);
        if (!breaker) {
            breaker = new CircuitBreaker(config);
            this.breakers.set(config.name, breaker);
        }
        return breaker;
    }

    /**
     * Get a circuit breaker by name.
     */
    get(name: string): CircuitBreaker | undefined {
        return this.breakers.get(name);
    }

    /**
     * Get all circuit breaker stats.
     */
    getAllStats(): CircuitBreakerStats[] {
        return Array.from(this.breakers.values()).map(b => b.getStats());
    }

    /**
     * Remove a circuit breaker.
     */
    remove(name: string): boolean {
        return this.breakers.delete(name);
    }

    /**
     * Clear all circuit breakers.
     */
    clear(): void {
        this.breakers.clear();
    }
}
