/**
 * JwtAuth - V14 JWT verification middleware.
 *
 * Extracts and verifies JWT tokens from Authorization header.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { JwtService, JwtPayload } from '../../infrastructure/auth/JwtService.js';
import { RequestContext, UserContext } from '../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { sendApiError } from '../../shared/errors/ErrorNormalizer.js';

/**
 * JWT authentication configuration.
 */
export interface JwtAuthConfig {
    /** Whether authentication is enabled */
    enabled: boolean;
    /** Routes to skip authentication */
    skipRoutes?: string[];
}

/**
 * Default JWT auth configuration.
 */
export const DEFAULT_JWT_AUTH_CONFIG: JwtAuthConfig = {
    enabled: true,
    skipRoutes: ['/admin/auth/login', '/health'],
};

/**
 * JWT authentication middleware.
 */
export class JwtAuth {
    private readonly jwtService: JwtService;
    private readonly config: JwtAuthConfig;

    constructor(jwtService: JwtService, config: Partial<JwtAuthConfig> = {}) {
        this.jwtService = jwtService;
        this.config = { ...DEFAULT_JWT_AUTH_CONFIG, ...config };
    }

    /**
     * Extract Bearer token from Authorization header.
     */
    private extractToken(req: IncomingMessage): string | null {
        const authHeader = req.headers.authorization;
        if (!authHeader) return null;

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
            return null;
        }

        return parts[1];
    }

    /**
     * Check if route should skip authentication.
     */
    private shouldSkip(route: string): boolean {
        if (!this.config.enabled) return true;
        return this.config.skipRoutes?.some(skip => route.startsWith(skip)) ?? false;
    }

    /**
     * Authenticate request.
     * Returns the JWT payload if valid, or throws ApiError.
     */
    authenticate(req: IncomingMessage): JwtPayload {
        const token = this.extractToken(req);

        if (!token) {
            throw ApiError.authMissing('Authorization header with Bearer token required');
        }

        const result = this.jwtService.verify(token);

        if (!result.valid || !result.payload) {
            if (result.error === 'Token expired') {
                throw ApiError.authExpired('Access token has expired');
            }
            throw ApiError.authInvalid(result.error ?? 'Invalid token');
        }

        return result.payload;
    }

    /**
     * Handle authentication for a request.
     * Returns true if authenticated (or skipped), false if response was sent.
     */
    handleAuth(req: IncomingMessage, res: ServerResponse): boolean {
        const route = req.url ?? '';

        // Skip authentication for certain routes
        if (this.shouldSkip(route)) {
            return true;
        }

        try {
            const payload = this.authenticate(req);

            // Set user context in RequestContext
            const user: UserContext = {
                userId: payload.sub,
                role: payload.role,
            };
            RequestContext.setUser(user);

            return true;
        } catch (error) {
            if (error instanceof ApiError) {
                const correlationId = RequestContext.getCorrelationId();
                sendApiError(res, error, correlationId);
            } else {
                const correlationId = RequestContext.getCorrelationId();
                sendApiError(res, ApiError.internal('Authentication error'), correlationId);
            }
            return false;
        }
    }

    /**
     * Get JWT payload from current request context.
     * Assumes handleAuth was called and succeeded.
     */
    getCurrentUser(): UserContext | undefined {
        return RequestContext.getUser();
    }

    /**
     * Create a middleware function.
     */
    middleware(): (req: IncomingMessage, res: ServerResponse) => boolean {
        return (req, res) => this.handleAuth(req, res);
    }
}
