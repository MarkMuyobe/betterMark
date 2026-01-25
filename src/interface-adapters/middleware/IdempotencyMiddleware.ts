/**
 * IdempotencyMiddleware - V14 Idempotency key handling.
 *
 * Ensures idempotent operations return the same result.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { IIdempotencyStore, InMemoryIdempotencyStore } from '../../infrastructure/persistence/in-memory/InMemoryIdempotencyStore.js';
import { RequestContext } from '../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { sendApiError } from '../../shared/errors/ErrorNormalizer.js';

/**
 * Header name for idempotency key.
 */
export const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key';

/**
 * Routes that require idempotency keys.
 */
export const IDEMPOTENT_ROUTES: RegExp[] = [
    /^\/admin\/suggestions\/[^/]+\/approve$/,
    /^\/admin\/suggestions\/[^/]+\/reject$/,
    /^\/admin\/preferences\/rollback$/,
    /^\/admin\/escalations\/[^/]+\/approve$/,
    /^\/admin\/escalations\/[^/]+\/reject$/,
    /^\/admin\/arbitrations\/[^/]+\/rollback$/,
];

/**
 * Idempotency middleware configuration.
 */
export interface IdempotencyConfig {
    /** Whether idempotency is enabled */
    enabled: boolean;
    /** TTL for stored responses in milliseconds */
    ttlMs: number;
    /** Routes that require idempotency keys */
    requiredRoutes?: RegExp[];
}

/**
 * Default idempotency configuration.
 */
export const DEFAULT_IDEMPOTENCY_CONFIG: IdempotencyConfig = {
    enabled: true,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    requiredRoutes: IDEMPOTENT_ROUTES,
};

/**
 * Idempotency middleware result.
 */
export interface IdempotencyResult {
    /** Whether a cached response was returned */
    cached: boolean;
    /** The idempotency key (if any) */
    key?: string;
}

/**
 * Idempotency middleware class.
 */
export class IdempotencyMiddleware {
    private readonly store: IIdempotencyStore;
    private readonly config: IdempotencyConfig;

    constructor(store: IIdempotencyStore, config: Partial<IdempotencyConfig> = {}) {
        this.store = store;
        this.config = { ...DEFAULT_IDEMPOTENCY_CONFIG, ...config };
    }

    /**
     * Check if a route requires an idempotency key.
     */
    private requiresIdempotencyKey(route: string, method: string): boolean {
        if (method !== 'POST') return false;
        return this.config.requiredRoutes?.some(pattern => pattern.test(route)) ?? false;
    }

    /**
     * Extract idempotency key from request.
     */
    private extractKey(req: IncomingMessage): string | undefined {
        const key = req.headers[IDEMPOTENCY_KEY_HEADER];
        if (typeof key === 'string' && key.length > 0) {
            return key;
        }
        return undefined;
    }

    /**
     * Generate a composite key from idempotency key and user.
     */
    private getCompositeKey(key: string, userId?: string): string {
        return userId ? `${userId}:${key}` : key;
    }

    /**
     * Handle idempotency for a request.
     * Returns true if request should proceed, false if cached response was sent.
     */
    handleIdempotency(req: IncomingMessage, res: ServerResponse): IdempotencyResult {
        if (!this.config.enabled) {
            return { cached: false };
        }

        const route = req.url?.split('?')[0] ?? '';
        const method = req.method ?? 'GET';
        const correlationId = RequestContext.getCorrelationId();

        // Check if route requires idempotency key
        if (!this.requiresIdempotencyKey(route, method)) {
            return { cached: false };
        }

        // Extract idempotency key
        const idempotencyKey = this.extractKey(req);
        if (!idempotencyKey) {
            const error = ApiError.idempotencyKeyMissing();
            sendApiError(res, error, correlationId);
            return { cached: true };
        }

        // Get user ID for composite key
        const user = RequestContext.getUser();
        const compositeKey = this.getCompositeKey(idempotencyKey, user?.userId);

        // Check for existing response
        const existing = this.store.get(compositeKey);

        if (existing) {
            if (existing.inProgress) {
                // Request is still being processed
                const error = ApiError.idempotencyConflict();
                sendApiError(res, error, correlationId);
                return { cached: true, key: idempotencyKey };
            }

            // Return cached response
            res.writeHead(existing.statusCode, existing.headers);
            res.end(existing.body);
            return { cached: true, key: idempotencyKey };
        }

        // Mark as in progress
        const marked = this.store.markInProgress(compositeKey);
        if (!marked) {
            // Race condition - another request started
            const error = ApiError.idempotencyConflict();
            sendApiError(res, error, correlationId);
            return { cached: true, key: idempotencyKey };
        }

        // Wrap response to capture for caching
        this.wrapResponse(res, compositeKey);

        return { cached: false, key: idempotencyKey };
    }

    /**
     * Wrap response to capture body for caching.
     */
    private wrapResponse(res: ServerResponse, compositeKey: string): void {
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        let body = '';
        let statusCode = 200;
        const headers: Record<string, string> = {};

        // Override writeHead to capture status
        const originalWriteHead = res.writeHead.bind(res);
        (res as any).writeHead = (
            code: number,
            arg1?: OutgoingHttpHeaders | string,
            arg2?: OutgoingHttpHeaders
        ): ServerResponse => {
            statusCode = code;
            // Handle both overload signatures: writeHead(code, headers) and writeHead(code, message, headers)
            const headersArg = typeof arg1 === 'object' ? arg1 : arg2;
            if (headersArg && typeof headersArg === 'object') {
                for (const [key, value] of Object.entries(headersArg)) {
                    if (value !== undefined) {
                        headers[key] = String(value);
                    }
                }
            }
            // Call original with same arguments
            if (arg2 !== undefined) {
                return originalWriteHead(code, arg1 as string, arg2);
            } else if (arg1 !== undefined) {
                return typeof arg1 === 'string'
                    ? originalWriteHead(code, arg1)
                    : originalWriteHead(code, arg1);
            }
            return originalWriteHead(code);
        };

        // Override write to capture body
        res.write = ((chunk: any, ...args: any[]): boolean => {
            if (chunk) {
                body += typeof chunk === 'string' ? chunk : chunk.toString();
            }
            return originalWrite(chunk, ...args);
        }) as typeof res.write;

        // Override end to store response
        res.end = ((chunk?: any, ...args: any[]): ServerResponse => {
            if (chunk) {
                body += typeof chunk === 'string' ? chunk : chunk.toString();
            }

            // Store the response
            this.store.set(compositeKey, {
                statusCode,
                body,
                headers,
            }, this.config.ttlMs);

            return originalEnd(chunk, ...args);
        }) as typeof res.end;
    }

    /**
     * Cancel an in-progress idempotent operation.
     */
    cancelInProgress(key: string, userId?: string): boolean {
        const compositeKey = this.getCompositeKey(key, userId);
        return this.store.remove(compositeKey);
    }
}

/**
 * Type for OutgoingHttpHeaders (simplified).
 */
type OutgoingHttpHeaders = Record<string, string | number | string[] | undefined>;
