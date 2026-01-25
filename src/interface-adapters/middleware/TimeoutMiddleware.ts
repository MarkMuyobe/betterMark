/**
 * TimeoutMiddleware - V14 Request timeout enforcement.
 *
 * Ensures requests don't exceed specified time limits.
 */

import { ServerResponse } from 'http';
import { RequestContext } from '../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { sendApiError } from '../../shared/errors/ErrorNormalizer.js';

/**
 * Timeout configuration.
 */
export interface TimeoutConfig {
    /** Timeout for read (GET) requests in ms */
    readTimeoutMs: number;
    /** Timeout for mutation (POST/PUT/DELETE) requests in ms */
    mutationTimeoutMs: number;
    /** Whether timeouts are enabled */
    enabled: boolean;
}

/**
 * Default timeout configuration.
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
    readTimeoutMs: 3000,       // 3 seconds for reads
    mutationTimeoutMs: 10000,  // 10 seconds for mutations
    enabled: true,
};

/**
 * Timeout handle for cancellation.
 */
export interface TimeoutHandle {
    cancel: () => void;
    isTimedOut: () => boolean;
}

/**
 * Timeout middleware class.
 */
export class TimeoutMiddleware {
    private readonly config: TimeoutConfig;

    constructor(config: Partial<TimeoutConfig> = {}) {
        this.config = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
    }

    /**
     * Get timeout for a method.
     */
    getTimeout(method: string): number {
        const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
        return isMutation ? this.config.mutationTimeoutMs : this.config.readTimeoutMs;
    }

    /**
     * Start a timeout for a request.
     * Returns a handle to cancel the timeout.
     */
    startTimeout(res: ServerResponse, method: string): TimeoutHandle {
        if (!this.config.enabled) {
            return {
                cancel: () => {},
                isTimedOut: () => false,
            };
        }

        const timeoutMs = this.getTimeout(method);
        let timedOut = false;
        let cancelled = false;

        const timeoutId = setTimeout(() => {
            if (cancelled) return;
            timedOut = true;

            // Only send timeout response if response hasn't started
            if (!res.headersSent) {
                const correlationId = RequestContext.getCorrelationId();
                const error = ApiError.timeout(`Request timed out after ${timeoutMs}ms`);
                sendApiError(res, error, correlationId);
            }
        }, timeoutMs);

        return {
            cancel: () => {
                cancelled = true;
                clearTimeout(timeoutId);
            },
            isTimedOut: () => timedOut,
        };
    }

    /**
     * Wrap a handler with timeout enforcement.
     */
    withTimeout<T>(
        res: ServerResponse,
        method: string,
        handler: () => Promise<T>
    ): Promise<T | undefined> {
        if (!this.config.enabled) {
            return handler();
        }

        const timeoutMs = this.getTimeout(method);

        return new Promise(async (resolve, reject) => {
            let timedOut = false;

            const timeoutId = setTimeout(() => {
                timedOut = true;

                // Only send timeout response if response hasn't started
                if (!res.headersSent) {
                    const correlationId = RequestContext.getCorrelationId();
                    const error = ApiError.timeout(`Request timed out after ${timeoutMs}ms`);
                    sendApiError(res, error, correlationId);
                }

                resolve(undefined);
            }, timeoutMs);

            try {
                const result = await handler();
                if (!timedOut) {
                    clearTimeout(timeoutId);
                    resolve(result);
                }
            } catch (error) {
                if (!timedOut) {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            }
        });
    }

    /**
     * Create a race between handler and timeout.
     */
    race<T>(
        res: ServerResponse,
        method: string,
        handler: () => Promise<T>
    ): Promise<T | null> {
        if (!this.config.enabled) {
            return handler();
        }

        const timeoutMs = this.getTimeout(method);

        const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => {
                if (!res.headersSent) {
                    const correlationId = RequestContext.getCorrelationId();
                    const error = ApiError.timeout(`Request timed out after ${timeoutMs}ms`);
                    sendApiError(res, error, correlationId);
                }
                resolve(null);
            }, timeoutMs);
        });

        return Promise.race([handler(), timeoutPromise]);
    }
}

/**
 * Abort controller wrapper for request timeout.
 */
export class RequestTimeoutController {
    private abortController: AbortController;
    private timeoutId?: ReturnType<typeof setTimeout>;

    constructor(private readonly timeoutMs: number) {
        this.abortController = new AbortController();
    }

    /**
     * Get the abort signal.
     */
    get signal(): AbortSignal {
        return this.abortController.signal;
    }

    /**
     * Start the timeout countdown.
     */
    start(): void {
        this.timeoutId = setTimeout(() => {
            this.abortController.abort();
        }, this.timeoutMs);
    }

    /**
     * Cancel the timeout.
     */
    cancel(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = undefined;
        }
    }

    /**
     * Check if timed out.
     */
    get isTimedOut(): boolean {
        return this.abortController.signal.aborted;
    }
}
