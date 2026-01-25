/**
 * InMemoryIdempotencyStore - V14 TTL-based response cache.
 *
 * Stores responses for idempotent operations.
 */

/**
 * Stored idempotent response.
 */
export interface IdempotentResponse {
    key: string;
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    createdAt: Date;
    expiresAt: Date;
    inProgress: boolean;
}

/**
 * Idempotency store interface.
 */
export interface IIdempotencyStore {
    get(key: string): IdempotentResponse | undefined;
    set(key: string, response: Omit<IdempotentResponse, 'key' | 'createdAt' | 'expiresAt' | 'inProgress'>, ttlMs: number): void;
    markInProgress(key: string, ttlMs?: number): boolean;
    isInProgress(key: string): boolean;
    remove(key: string): boolean;
    cleanup(): number;
}

/**
 * In-memory idempotency store implementation.
 */
export class InMemoryIdempotencyStore implements IIdempotencyStore {
    private responses: Map<string, IdempotentResponse> = new Map();
    private cleanupInterval?: ReturnType<typeof setInterval>;

    /**
     * Default TTL: 24 hours.
     */
    static readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

    /**
     * In-progress timeout: 30 seconds.
     */
    static readonly IN_PROGRESS_TTL_MS = 30 * 1000;

    constructor(autoCleanupIntervalMs?: number) {
        if (autoCleanupIntervalMs) {
            this.cleanupInterval = setInterval(() => this.cleanup(), autoCleanupIntervalMs);
        }
    }

    /**
     * Get a stored response by idempotency key.
     */
    get(key: string): IdempotentResponse | undefined {
        const response = this.responses.get(key);
        if (!response) return undefined;

        // Check if expired
        if (response.expiresAt < new Date()) {
            this.responses.delete(key);
            return undefined;
        }

        return response;
    }

    /**
     * Store a response for an idempotency key.
     */
    set(
        key: string,
        response: Omit<IdempotentResponse, 'key' | 'createdAt' | 'expiresAt' | 'inProgress'>,
        ttlMs: number = InMemoryIdempotencyStore.DEFAULT_TTL_MS
    ): void {
        const now = new Date();
        this.responses.set(key, {
            key,
            ...response,
            createdAt: now,
            expiresAt: new Date(now.getTime() + ttlMs),
            inProgress: false,
        });
    }

    /**
     * Mark a key as in-progress (being processed).
     * Returns true if successfully marked, false if already in progress or exists.
     */
    markInProgress(key: string, ttlMs: number = InMemoryIdempotencyStore.IN_PROGRESS_TTL_MS): boolean {
        const existing = this.get(key);

        // If exists and not expired, don't allow
        if (existing) {
            return false;
        }

        const now = new Date();
        this.responses.set(key, {
            key,
            statusCode: 0,
            body: '',
            headers: {},
            createdAt: now,
            expiresAt: new Date(now.getTime() + ttlMs),
            inProgress: true,
        });

        return true;
    }

    /**
     * Check if a key is currently being processed.
     */
    isInProgress(key: string): boolean {
        const response = this.get(key);
        return response?.inProgress ?? false;
    }

    /**
     * Remove a stored response.
     */
    remove(key: string): boolean {
        return this.responses.delete(key);
    }

    /**
     * Clean up expired entries.
     */
    cleanup(): number {
        const now = new Date();
        let removed = 0;

        for (const [key, response] of this.responses.entries()) {
            if (response.expiresAt < now) {
                this.responses.delete(key);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Get store statistics.
     */
    getStats(): { total: number; inProgress: number; completed: number; expired: number } {
        const now = new Date();
        let inProgress = 0;
        let completed = 0;
        let expired = 0;

        for (const response of this.responses.values()) {
            if (response.expiresAt < now) {
                expired++;
            } else if (response.inProgress) {
                inProgress++;
            } else {
                completed++;
            }
        }

        return {
            total: this.responses.size,
            inProgress,
            completed,
            expired,
        };
    }

    /**
     * Clear all entries (for testing).
     */
    clear(): void {
        this.responses.clear();
    }

    /**
     * Stop auto-cleanup.
     */
    stopCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
    }
}
