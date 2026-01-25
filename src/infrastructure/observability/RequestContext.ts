/**
 * RequestContext - V14 AsyncLocalStorage for request-scoped context.
 *
 * Provides thread-safe request context propagation across async operations.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

/**
 * User context for authenticated requests.
 */
export interface UserContext {
    userId: string;
    role: 'admin' | 'operator' | 'auditor';
}

/**
 * Context data stored per request.
 */
export interface RequestContextData {
    correlationId: string;
    requestId: string;
    startTime: Date;
    route?: string;
    method?: string;
    user?: UserContext;
}

/**
 * Global AsyncLocalStorage instance for request context.
 */
const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

/**
 * RequestContext - Utility class for managing request-scoped context.
 */
export class RequestContext {
    /**
     * Run a function with a new request context.
     */
    static run<T>(context: Partial<RequestContextData>, fn: () => T): T {
        const fullContext: RequestContextData = {
            correlationId: context.correlationId ?? IdGenerator.generate(),
            requestId: context.requestId ?? IdGenerator.generate(),
            startTime: context.startTime ?? new Date(),
            route: context.route,
            method: context.method,
            user: context.user,
        };
        return asyncLocalStorage.run(fullContext, fn);
    }

    /**
     * Run an async function with a new request context.
     */
    static async runAsync<T>(context: Partial<RequestContextData>, fn: () => Promise<T>): Promise<T> {
        const fullContext: RequestContextData = {
            correlationId: context.correlationId ?? IdGenerator.generate(),
            requestId: context.requestId ?? IdGenerator.generate(),
            startTime: context.startTime ?? new Date(),
            route: context.route,
            method: context.method,
            user: context.user,
        };
        return asyncLocalStorage.run(fullContext, fn);
    }

    /**
     * Get the current request context.
     */
    static get(): RequestContextData | undefined {
        return asyncLocalStorage.getStore();
    }

    /**
     * Get the current correlation ID, or generate a new one if not in a request context.
     */
    static getCorrelationId(): string {
        return asyncLocalStorage.getStore()?.correlationId ?? IdGenerator.generate();
    }

    /**
     * Get the current request ID.
     */
    static getRequestId(): string | undefined {
        return asyncLocalStorage.getStore()?.requestId;
    }

    /**
     * Get the current user context.
     */
    static getUser(): UserContext | undefined {
        return asyncLocalStorage.getStore()?.user;
    }

    /**
     * Get the current route.
     */
    static getRoute(): string | undefined {
        return asyncLocalStorage.getStore()?.route;
    }

    /**
     * Get the elapsed time since request start in milliseconds.
     */
    static getElapsedMs(): number {
        const ctx = asyncLocalStorage.getStore();
        if (!ctx) return 0;
        return Date.now() - ctx.startTime.getTime();
    }

    /**
     * Update the current context with user information.
     * This is used after authentication to add user context.
     */
    static setUser(user: UserContext): void {
        const ctx = asyncLocalStorage.getStore();
        if (ctx) {
            ctx.user = user;
        }
    }

    /**
     * Update the current context with route information.
     */
    static setRoute(route: string, method: string): void {
        const ctx = asyncLocalStorage.getStore();
        if (ctx) {
            ctx.route = route;
            ctx.method = method;
        }
    }

    /**
     * Check if we're currently in a request context.
     */
    static hasContext(): boolean {
        return asyncLocalStorage.getStore() !== undefined;
    }

    /**
     * Get the underlying AsyncLocalStorage for advanced use cases.
     */
    static getStorage(): AsyncLocalStorage<RequestContextData> {
        return asyncLocalStorage;
    }
}
