/**
 * JwtService - V14 JWT token signing and verification.
 *
 * Simple JWT implementation using Node.js crypto.
 * In production, consider using a library like jsonwebtoken.
 */

import { createHmac } from 'crypto';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

/**
 * JWT payload structure.
 */
export interface JwtPayload {
    sub: string;           // Subject (user ID)
    role: 'admin' | 'operator' | 'auditor';
    iat: number;           // Issued at (timestamp)
    exp: number;           // Expiration (timestamp)
    jti?: string;          // JWT ID (unique identifier)
}

/**
 * Decoded JWT token.
 */
export interface DecodedToken {
    header: { alg: string; typ: string };
    payload: JwtPayload;
    signature: string;
}

/**
 * JWT verification result.
 */
export interface JwtVerifyResult {
    valid: boolean;
    payload?: JwtPayload;
    error?: string;
}

/**
 * JWT service configuration.
 */
export interface JwtServiceConfig {
    secret: string;
    accessTokenTtlMs: number;
    refreshTokenTtlMs: number;
    issuer?: string;
}

/**
 * Default JWT configuration.
 */
export const DEFAULT_JWT_CONFIG: JwtServiceConfig = {
    secret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production',
    accessTokenTtlMs: 15 * 60 * 1000,        // 15 minutes
    refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    issuer: 'bettermark',
};

/**
 * JWT service for token management.
 */
export class JwtService {
    private readonly config: JwtServiceConfig;

    constructor(config: Partial<JwtServiceConfig> = {}) {
        this.config = { ...DEFAULT_JWT_CONFIG, ...config };
    }

    /**
     * Sign a JWT token.
     */
    sign(payload: Omit<JwtPayload, 'iat' | 'exp'>, ttlMs?: number): string {
        const now = Date.now();
        const fullPayload: JwtPayload = {
            ...payload,
            iat: Math.floor(now / 1000),
            exp: Math.floor((now + (ttlMs ?? this.config.accessTokenTtlMs)) / 1000),
            jti: payload.jti ?? IdGenerator.generate(),
        };

        const header = { alg: 'HS256', typ: 'JWT' };
        const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
        const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload));
        const signature = this.createSignature(`${encodedHeader}.${encodedPayload}`);

        return `${encodedHeader}.${encodedPayload}.${signature}`;
    }

    /**
     * Create an access token.
     */
    createAccessToken(userId: string, role: JwtPayload['role']): string {
        return this.sign({ sub: userId, role }, this.config.accessTokenTtlMs);
    }

    /**
     * Create a refresh token.
     */
    createRefreshToken(userId: string, role: JwtPayload['role']): string {
        return this.sign({ sub: userId, role }, this.config.refreshTokenTtlMs);
    }

    /**
     * Verify a JWT token.
     */
    verify(token: string): JwtVerifyResult {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return { valid: false, error: 'Invalid token format' };
            }

            const [encodedHeader, encodedPayload, signature] = parts;

            // Verify signature
            const expectedSignature = this.createSignature(`${encodedHeader}.${encodedPayload}`);
            if (signature !== expectedSignature) {
                return { valid: false, error: 'Invalid signature' };
            }

            // Decode payload
            const payload = JSON.parse(this.base64UrlDecode(encodedPayload)) as JwtPayload;

            // Check expiration
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp < now) {
                return { valid: false, error: 'Token expired' };
            }

            return { valid: true, payload };
        } catch (error) {
            return { valid: false, error: 'Token verification failed' };
        }
    }

    /**
     * Decode a token without verification (for inspection).
     */
    decode(token: string): DecodedToken | null {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            return {
                header: JSON.parse(this.base64UrlDecode(parts[0])),
                payload: JSON.parse(this.base64UrlDecode(parts[1])),
                signature: parts[2],
            };
        } catch {
            return null;
        }
    }

    /**
     * Create HMAC signature.
     */
    private createSignature(data: string): string {
        return createHmac('sha256', this.config.secret)
            .update(data)
            .digest('base64url');
    }

    /**
     * Base64URL encode.
     */
    private base64UrlEncode(data: string): string {
        return Buffer.from(data)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Base64URL decode.
     */
    private base64UrlDecode(data: string): string {
        const padded = data + '='.repeat((4 - (data.length % 4)) % 4);
        const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(base64, 'base64').toString('utf8');
    }

    /**
     * Get token TTL configuration.
     */
    getAccessTokenTtl(): number {
        return this.config.accessTokenTtlMs;
    }

    getRefreshTokenTtl(): number {
        return this.config.refreshTokenTtlMs;
    }
}
