/**
 * AdminAuthController - V14 Authentication endpoints.
 *
 * Handles login, token refresh, and logout.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { JwtService } from '../../../infrastructure/auth/JwtService.js';
import { ITokenStore } from '../../../infrastructure/auth/TokenStore.js';
import { IUserStore } from '../../../infrastructure/auth/UserStore.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendSuccessResponse } from '../../../shared/errors/ErrorNormalizer.js';
import { validate } from '../../../shared/validation/RequestValidator.js';
import { ValidationSchema, stringField } from '../../../shared/validation/ValidationSchema.js';
import { ValidationError } from '../../../shared/validation/ValidationError.js';

/**
 * Login request schema.
 */
const LoginSchema: ValidationSchema = {
    username: stringField({ required: true, min: 1, max: 50 }),
    password: stringField({ required: true, min: 1, max: 100 }),
};

/**
 * Refresh request schema.
 */
const RefreshSchema: ValidationSchema = {
    refreshToken: stringField({ required: true, min: 1 }),
};

/**
 * Auth controller for admin authentication.
 */
export class AdminAuthController {
    constructor(
        private readonly jwtService: JwtService,
        private readonly tokenStore: ITokenStore,
        private readonly userStore: IUserStore
    ) {}

    /**
     * Handle login request.
     * POST /admin/auth/login
     * Body: { username: string, password: string }
     */
    async login(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);

            // Validate request
            const validation = validate(body, LoginSchema, { isMutation: true });
            if (!validation.valid) {
                throw ValidationError.fromFieldErrors(validation.errors);
            }

            const { username, password } = body as { username: string; password: string };

            // Validate credentials
            const user = this.userStore.validatePassword(username, password);
            if (!user) {
                throw ApiError.authInvalid('Invalid username or password');
            }

            // Generate tokens
            const accessToken = this.jwtService.createAccessToken(user.id, user.role);
            const refreshToken = this.jwtService.createRefreshToken(user.id, user.role);

            // Store refresh token
            const decoded = this.jwtService.decode(refreshToken);
            if (decoded?.payload.jti) {
                this.tokenStore.store(
                    decoded.payload.jti,
                    user.id,
                    user.role,
                    this.jwtService.getRefreshTokenTtl()
                );
            }

            sendSuccessResponse(res, {
                accessToken,
                refreshToken,
                expiresIn: Math.floor(this.jwtService.getAccessTokenTtl() / 1000),
                tokenType: 'Bearer',
            }, correlationId);
        } catch (error) {
            if (error instanceof ApiError) {
                sendApiError(res, error, correlationId);
            } else {
                sendApiError(res, ApiError.internal('Login failed'), correlationId);
            }
        }
    }

    /**
     * Handle token refresh request.
     * POST /admin/auth/refresh
     * Body: { refreshToken: string }
     */
    async refresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);

            // Validate request
            const validation = validate(body, RefreshSchema, { isMutation: true });
            if (!validation.valid) {
                throw ValidationError.fromFieldErrors(validation.errors);
            }

            const { refreshToken } = body as { refreshToken: string };

            // Verify refresh token
            const result = this.jwtService.verify(refreshToken);
            if (!result.valid || !result.payload) {
                throw ApiError.authInvalid('Invalid refresh token');
            }

            // Check if refresh token is in store and valid
            const { jti } = result.payload;
            if (!jti || !this.tokenStore.isValid(jti)) {
                throw ApiError.authInvalid('Refresh token has been revoked');
            }

            // Invalidate old refresh token
            this.tokenStore.invalidate(jti);

            // Generate new tokens
            const accessToken = this.jwtService.createAccessToken(
                result.payload.sub,
                result.payload.role
            );
            const newRefreshToken = this.jwtService.createRefreshToken(
                result.payload.sub,
                result.payload.role
            );

            // Store new refresh token
            const decoded = this.jwtService.decode(newRefreshToken);
            if (decoded?.payload.jti) {
                this.tokenStore.store(
                    decoded.payload.jti,
                    result.payload.sub,
                    result.payload.role,
                    this.jwtService.getRefreshTokenTtl()
                );
            }

            sendSuccessResponse(res, {
                accessToken,
                refreshToken: newRefreshToken,
                expiresIn: Math.floor(this.jwtService.getAccessTokenTtl() / 1000),
                tokenType: 'Bearer',
            }, correlationId);
        } catch (error) {
            if (error instanceof ApiError) {
                sendApiError(res, error, correlationId);
            } else {
                sendApiError(res, ApiError.internal('Token refresh failed'), correlationId);
            }
        }
    }

    /**
     * Handle logout request.
     * POST /admin/auth/logout
     * Body: { refreshToken?: string } - if provided, invalidates only that token
     */
    async logout(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);
            const user = RequestContext.getUser();

            if (body.refreshToken) {
                // Invalidate specific refresh token
                const decoded = this.jwtService.decode(body.refreshToken as string);
                if (decoded?.payload.jti) {
                    this.tokenStore.invalidate(decoded.payload.jti);
                }
            } else if (user) {
                // Invalidate all refresh tokens for user
                this.tokenStore.invalidateAllForUser(user.userId);
            }

            sendSuccessResponse(res, { message: 'Logged out successfully' }, correlationId);
        } catch (error) {
            if (error instanceof ApiError) {
                sendApiError(res, error, correlationId);
            } else {
                sendApiError(res, ApiError.internal('Logout failed'), correlationId);
            }
        }
    }

    /**
     * Read request body as JSON.
     */
    private readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (e) {
                    reject(ApiError.validation('Invalid JSON body'));
                }
            });
            req.on('error', reject);
        });
    }
}
