/**
 * SessionAuth - V15 Simple cookie-based session authentication for MVP single user.
 *
 * Provides session management without JWT complexity for the product UI.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { createHmac, randomBytes } from 'crypto';

/**
 * Session data stored in memory.
 */
export interface SessionData {
    sessionId: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
}

/**
 * Session auth configuration.
 */
export interface SessionAuthConfig {
    secret: string;
    sessionTtlMs: number;
    cookieName: string;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
}

/**
 * Default session configuration.
 */
export const DEFAULT_SESSION_CONFIG: SessionAuthConfig = {
    secret: process.env.SESSION_SECRET ?? 'dev-session-secret-change-in-production',
    sessionTtlMs: 24 * 60 * 60 * 1000, // 24 hours
    cookieName: 'bm_session',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
};

/**
 * In-memory session store.
 */
export class InMemorySessionStore {
    private sessions: Map<string, SessionData> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(cleanupIntervalMs: number = 60000) {
        this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    }

    save(session: SessionData): void {
        this.sessions.set(session.sessionId, session);
    }

    find(sessionId: string): SessionData | null {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        // Check if expired
        if (session.expiresAt < new Date()) {
            this.sessions.delete(sessionId);
            return null;
        }

        return session;
    }

    delete(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    deleteByUserId(userId: string): void {
        for (const [id, session] of this.sessions) {
            if (session.userId === userId) {
                this.sessions.delete(id);
            }
        }
    }

    private cleanup(): void {
        const now = new Date();
        for (const [id, session] of this.sessions) {
            if (session.expiresAt < now) {
                this.sessions.delete(id);
            }
        }
    }

    dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

/**
 * Session authentication service.
 */
export class SessionAuth {
    private readonly config: SessionAuthConfig;
    private readonly store: InMemorySessionStore;

    constructor(
        store: InMemorySessionStore,
        config: Partial<SessionAuthConfig> = {}
    ) {
        this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
        this.store = store;
    }

    /**
     * Create a new session for a user.
     */
    createSession(userId: string): SessionData {
        const sessionId = this.generateSessionId();
        const now = new Date();

        const session: SessionData = {
            sessionId,
            userId,
            createdAt: now,
            expiresAt: new Date(now.getTime() + this.config.sessionTtlMs),
        };

        this.store.save(session);
        return session;
    }

    /**
     * Validate a session by ID.
     */
    validateSession(sessionId: string): SessionData | null {
        return this.store.find(sessionId);
    }

    /**
     * Destroy a session.
     */
    destroySession(sessionId: string): void {
        this.store.delete(sessionId);
    }

    /**
     * Destroy all sessions for a user.
     */
    destroyUserSessions(userId: string): void {
        this.store.deleteByUserId(userId);
    }

    /**
     * Extract session ID from request cookies.
     */
    getSessionIdFromRequest(req: IncomingMessage): string | null {
        const cookieHeader = req.headers.cookie;
        if (!cookieHeader) return null;

        const cookies = this.parseCookies(cookieHeader);
        return cookies[this.config.cookieName] ?? null;
    }

    /**
     * Get session data from request.
     */
    getSessionFromRequest(req: IncomingMessage): SessionData | null {
        const sessionId = this.getSessionIdFromRequest(req);
        if (!sessionId) return null;

        return this.validateSession(sessionId);
    }

    /**
     * Set session cookie on response.
     */
    setSessionCookie(res: ServerResponse, session: SessionData): void {
        const cookie = this.buildCookie(session.sessionId, session.expiresAt);
        this.appendSetCookieHeader(res, cookie);
    }

    /**
     * Clear session cookie on response.
     */
    clearSessionCookie(res: ServerResponse): void {
        const cookie = this.buildCookie('', new Date(0));
        this.appendSetCookieHeader(res, cookie);
    }

    /**
     * Handle authentication check for a request.
     * Returns the session if valid, null otherwise.
     */
    handleAuth(req: IncomingMessage, res: ServerResponse): SessionData | null {
        const session = this.getSessionFromRequest(req);

        if (!session) {
            this.sendUnauthorized(res);
            return null;
        }

        return session;
    }

    /**
     * Send unauthorized response.
     */
    private sendUnauthorized(res: ServerResponse): void {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
            },
        }));
    }

    /**
     * Generate a secure session ID.
     */
    private generateSessionId(): string {
        const random = randomBytes(32).toString('hex');
        const timestamp = Date.now().toString(36);
        const data = `${random}:${timestamp}`;

        return createHmac('sha256', this.config.secret)
            .update(data)
            .digest('hex');
    }

    /**
     * Build a Set-Cookie header value.
     */
    private buildCookie(value: string, expires: Date): string {
        const parts = [
            `${this.config.cookieName}=${value}`,
            `Expires=${expires.toUTCString()}`,
            'Path=/',
            `SameSite=${this.config.sameSite}`,
            'HttpOnly',
        ];

        if (this.config.secure) {
            parts.push('Secure');
        }

        return parts.join('; ');
    }

    /**
     * Parse cookies from header.
     */
    private parseCookies(cookieHeader: string): Record<string, string> {
        const cookies: Record<string, string> = {};

        cookieHeader.split(';').forEach(cookie => {
            const [name, ...rest] = cookie.trim().split('=');
            if (name) {
                cookies[name] = rest.join('=');
            }
        });

        return cookies;
    }

    /**
     * Append to Set-Cookie header (supports multiple cookies).
     */
    private appendSetCookieHeader(res: ServerResponse, cookie: string): void {
        const existing = res.getHeader('Set-Cookie');

        if (!existing) {
            res.setHeader('Set-Cookie', cookie);
        } else if (Array.isArray(existing)) {
            res.setHeader('Set-Cookie', [...existing, cookie]);
        } else {
            res.setHeader('Set-Cookie', [existing.toString(), cookie]);
        }
    }
}
