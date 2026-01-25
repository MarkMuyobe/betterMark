/**
 * API Key Authentication Middleware for V13 Admin Control Plane.
 */

import { IncomingMessage, ServerResponse } from 'http';

/**
 * Configuration for API key authentication.
 */
export interface ApiKeyAuthConfig {
    /** Header name to read the API key from */
    headerName: string;
    /** Valid API keys (in production, use a proper secret store) */
    validKeys: string[];
    /** Whether authentication is enabled */
    enabled: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_API_KEY_AUTH_CONFIG: ApiKeyAuthConfig = {
    headerName: 'x-admin-key',
    validKeys: [process.env.ADMIN_API_KEY ?? 'dev-admin-key'],
    enabled: true,
};

/**
 * Result of authentication check.
 */
export interface AuthResult {
    authenticated: boolean;
    error?: string;
}

/**
 * API Key authentication middleware.
 */
export class ApiKeyAuth {
    private config: ApiKeyAuthConfig;

    constructor(config: Partial<ApiKeyAuthConfig> = {}) {
        this.config = { ...DEFAULT_API_KEY_AUTH_CONFIG, ...config };
    }

    /**
     * Check if the request is authenticated.
     */
    authenticate(req: IncomingMessage): AuthResult {
        if (!this.config.enabled) {
            return { authenticated: true };
        }

        const apiKey = req.headers[this.config.headerName] as string | undefined;

        if (!apiKey) {
            return {
                authenticated: false,
                error: 'Missing API key. Provide it in the X-Admin-Key header.',
            };
        }

        if (!this.config.validKeys.includes(apiKey)) {
            return {
                authenticated: false,
                error: 'Invalid API key.',
            };
        }

        return { authenticated: true };
    }

    /**
     * Middleware function that checks authentication and sends 401 if not authenticated.
     * Returns true if authenticated, false if response was sent.
     */
    handleAuth(req: IncomingMessage, res: ServerResponse): boolean {
        const result = this.authenticate(req);

        if (!result.authenticated) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: result.error,
            }));
            return false;
        }

        return true;
    }
}
