/**
 * TokenStore - V14 Refresh token storage.
 *
 * In-memory storage for refresh tokens with TTL.
 * In production, use Redis or a database.
 */

/**
 * Stored token entry.
 */
export interface StoredToken {
    tokenId: string;
    userId: string;
    role: 'admin' | 'operator' | 'auditor';
    expiresAt: Date;
    createdAt: Date;
    invalidated: boolean;
}

/**
 * Token store interface.
 */
export interface ITokenStore {
    store(tokenId: string, userId: string, role: StoredToken['role'], ttlMs: number): void;
    get(tokenId: string): StoredToken | undefined;
    invalidate(tokenId: string): boolean;
    invalidateAllForUser(userId: string): number;
    isValid(tokenId: string): boolean;
    cleanup(): number;
}

/**
 * In-memory token store implementation.
 */
export class InMemoryTokenStore implements ITokenStore {
    private tokens: Map<string, StoredToken> = new Map();
    private cleanupInterval?: ReturnType<typeof setInterval>;

    constructor(autoCleanupIntervalMs?: number) {
        if (autoCleanupIntervalMs) {
            this.cleanupInterval = setInterval(() => this.cleanup(), autoCleanupIntervalMs);
        }
    }

    /**
     * Store a new refresh token.
     */
    store(tokenId: string, userId: string, role: StoredToken['role'], ttlMs: number): void {
        const entry: StoredToken = {
            tokenId,
            userId,
            role,
            expiresAt: new Date(Date.now() + ttlMs),
            createdAt: new Date(),
            invalidated: false,
        };
        this.tokens.set(tokenId, entry);
    }

    /**
     * Get a stored token.
     */
    get(tokenId: string): StoredToken | undefined {
        return this.tokens.get(tokenId);
    }

    /**
     * Invalidate a specific token.
     */
    invalidate(tokenId: string): boolean {
        const token = this.tokens.get(tokenId);
        if (token) {
            token.invalidated = true;
            return true;
        }
        return false;
    }

    /**
     * Invalidate all tokens for a user.
     */
    invalidateAllForUser(userId: string): number {
        let count = 0;
        for (const token of this.tokens.values()) {
            if (token.userId === userId && !token.invalidated) {
                token.invalidated = true;
                count++;
            }
        }
        return count;
    }

    /**
     * Check if a token is valid.
     */
    isValid(tokenId: string): boolean {
        const token = this.tokens.get(tokenId);
        if (!token) return false;
        if (token.invalidated) return false;
        if (token.expiresAt < new Date()) return false;
        return true;
    }

    /**
     * Clean up expired tokens.
     */
    cleanup(): number {
        const now = new Date();
        let removed = 0;

        for (const [tokenId, token] of this.tokens.entries()) {
            if (token.expiresAt < now || token.invalidated) {
                this.tokens.delete(tokenId);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Get all tokens for a user (for debugging/admin).
     */
    getTokensForUser(userId: string): StoredToken[] {
        const tokens: StoredToken[] = [];
        for (const token of this.tokens.values()) {
            if (token.userId === userId) {
                tokens.push({ ...token });
            }
        }
        return tokens;
    }

    /**
     * Get store statistics.
     */
    getStats(): { total: number; valid: number; expired: number; invalidated: number } {
        const now = new Date();
        let valid = 0;
        let expired = 0;
        let invalidated = 0;

        for (const token of this.tokens.values()) {
            if (token.invalidated) {
                invalidated++;
            } else if (token.expiresAt < now) {
                expired++;
            } else {
                valid++;
            }
        }

        return {
            total: this.tokens.size,
            valid,
            expired,
            invalidated,
        };
    }

    /**
     * Clear all tokens (for testing).
     */
    clear(): void {
        this.tokens.clear();
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
