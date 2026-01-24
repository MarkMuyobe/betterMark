/**
 * AdminRouter - V14 Admin Control Plane routing.
 *
 * Wires up all admin endpoints with JWT authentication and middleware.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { Router } from './Router.js';
import { JwtAuth } from '../middleware/JwtAuth.js';
import { IdempotencyMiddleware } from '../middleware/IdempotencyMiddleware.js';
import { TimeoutMiddleware } from '../middleware/TimeoutMiddleware.js';
import { RoleGuard, checkRouteAuthorization } from '../middleware/RoleGuard.js';
import { AdminPreferencesController } from '../controllers/admin/AdminPreferencesController.js';
import { AdminSuggestionsController } from '../controllers/admin/AdminSuggestionsController.js';
import { AdminArbitrationsController } from '../controllers/admin/AdminArbitrationsController.js';
import { AdminAuditController } from '../controllers/admin/AdminAuditController.js';
import { AdminExplanationsController } from '../controllers/admin/AdminExplanationsController.js';
import { AdminAuthController } from '../controllers/admin/AdminAuthController.js';
import { RequestContext } from '../../infrastructure/observability/RequestContext.js';
import { withCorrelation } from '../../infrastructure/observability/CorrelationMiddleware.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { sendApiError } from '../../shared/errors/ErrorNormalizer.js';
import { AdminMetrics } from '../../infrastructure/observability/AdminMetrics.js';

/**
 * Admin router dependencies.
 */
export interface AdminRouterDependencies {
    preferencesController: AdminPreferencesController;
    suggestionsController: AdminSuggestionsController;
    arbitrationsController: AdminArbitrationsController;
    auditController: AdminAuditController;
    explanationsController: AdminExplanationsController;
    authController: AdminAuthController;
    jwtAuth: JwtAuth;
    idempotencyMiddleware: IdempotencyMiddleware;
    timeoutMiddleware: TimeoutMiddleware;
    adminMetrics: AdminMetrics;
}

/**
 * Router for admin control plane endpoints.
 */
export class AdminRouter {
    private router: Router;
    private jwtAuth: JwtAuth;
    private idempotencyMiddleware: IdempotencyMiddleware;
    private timeoutMiddleware: TimeoutMiddleware;
    private adminMetrics: AdminMetrics;

    constructor(private readonly dependencies: AdminRouterDependencies) {
        this.router = new Router('/admin');
        this.jwtAuth = dependencies.jwtAuth;
        this.idempotencyMiddleware = dependencies.idempotencyMiddleware;
        this.timeoutMiddleware = dependencies.timeoutMiddleware;
        this.adminMetrics = dependencies.adminMetrics;

        this.setupRoutes();
    }

    /**
     * Setup all admin routes.
     */
    private setupRoutes(): void {
        const {
            preferencesController,
            suggestionsController,
            arbitrationsController,
            auditController,
            explanationsController,
            authController,
        } = this.dependencies;

        // Auth routes (no JWT required)
        this.router.post('/auth/login', (req, res) =>
            authController.login(req, res)
        );
        this.router.post('/auth/refresh', (req, res) =>
            authController.refresh(req, res)
        );
        this.router.post('/auth/logout', (req, res) =>
            authController.logout(req, res)
        );

        // Preferences routes
        this.router.get('/preferences', (req, res, params) =>
            preferencesController.list(req, res, params)
        );
        this.router.post('/preferences/rollback', (req, res, params) =>
            preferencesController.rollback(req, res)
        );

        // Suggestions routes
        this.router.get('/suggestions', (req, res, params) =>
            suggestionsController.list(req, res, params)
        );
        this.router.post('/suggestions/:id/approve', (req, res, params) =>
            suggestionsController.approve(req, res, params)
        );
        this.router.post('/suggestions/:id/reject', (req, res, params) =>
            suggestionsController.reject(req, res, params)
        );

        // Arbitrations routes
        this.router.get('/arbitrations', (req, res, params) =>
            arbitrationsController.list(req, res, params)
        );
        this.router.post('/arbitrations/:id/rollback', (req, res, params) =>
            arbitrationsController.rollbackDecision(req, res, params)
        );

        // Escalations routes
        this.router.get('/escalations/pending', (req, res, params) =>
            arbitrationsController.listPending(req, res, params)
        );
        this.router.post('/escalations/:id/approve', (req, res, params) =>
            arbitrationsController.approveEscalation(req, res, params)
        );
        this.router.post('/escalations/:id/reject', (req, res, params) =>
            arbitrationsController.rejectEscalation(req, res, params)
        );

        // Audit routes
        this.router.get('/audit', (req, res, params) =>
            auditController.list(req, res, params)
        );
        this.router.get('/audit/agent/:agent', (req, res, params) =>
            auditController.listByAgent(req, res, params)
        );
        this.router.get('/audit/type/:type', (req, res, params) =>
            auditController.listByType(req, res, params)
        );

        // Explanations routes
        this.router.get('/explanations/:id', (req, res, params) =>
            explanationsController.getExplanation(req, res, params)
        );
        this.router.get('/explanations/arbitration/:id', (req, res, params) =>
            explanationsController.getArbitrationExplanation(req, res, params)
        );
        this.router.get('/explanations/adaptation/:id', (req, res, params) =>
            explanationsController.getAdaptationExplanation(req, res, params)
        );
    }

    /**
     * Check if route is a public auth route (no JWT required).
     */
    private isPublicRoute(url: string): boolean {
        return url.startsWith('/admin/auth/login') ||
               url.startsWith('/admin/auth/refresh');
    }

    /**
     * Try to handle a request.
     * Returns true if the request was handled (matched a route).
     */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = req.url ?? '';
        const method = req.method ?? 'GET';

        // Only handle /admin/* routes
        if (!url.startsWith('/admin')) {
            return false;
        }

        // Start request timing
        const startTime = Date.now();

        // Wrap everything in correlation context
        return withCorrelation(req, res, async () => {
            const correlationId = RequestContext.getCorrelationId();
            let statusCode = 200;

            // Capture the original end method to track response status
            const originalEnd = res.end.bind(res);
            res.end = ((...args: Parameters<typeof res.end>) => {
                statusCode = res.statusCode;
                return originalEnd(...args);
            }) as typeof res.end;

            try {
                // Skip JWT auth for public routes
                if (!this.isPublicRoute(url)) {
                    // Check JWT authentication
                    if (!this.jwtAuth.handleAuth(req, res)) {
                        // V14: Record auth failure (if metrics available)
                        this.adminMetrics?.recordAuthFailure('invalid');
                        return;
                    }

                    // Check authorization
                    const route = url.split('?')[0];
                    if (!checkRouteAuthorization(route, method)) {
                        // V14: Record forbidden auth failure (if metrics available)
                        this.adminMetrics?.recordAuthFailure('forbidden');
                        sendApiError(res, ApiError.forbidden('Insufficient permissions'), correlationId);
                        return;
                    }
                }

                // Check idempotency for mutations
                const idempotencyResult = this.idempotencyMiddleware.handleIdempotency(req, res);
                if (idempotencyResult.cached) {
                    // V14: Record idempotency cache hit (if metrics available)
                    this.adminMetrics?.recordIdempotencyCacheHit();
                    return;
                }

                // Apply timeout middleware
                const timeoutResult = await this.timeoutMiddleware.withTimeout(res, method, async () => {
                    // Route the request
                    const handled = await this.router.handle(req, res);

                    if (!handled) {
                        // Admin route prefix matched but no specific route found
                        sendApiError(res, ApiError.notFound('Admin endpoint', url), correlationId);
                    }

                    return handled;
                });

                // If timeout occurred, response was already sent
                if (timeoutResult === undefined) {
                    return;
                }
            } finally {
                // V14: Record request metrics (if metrics available)
                const durationMs = Date.now() - startTime;
                this.adminMetrics?.recordRequest(method, url, statusCode, durationMs);
            }
        }).then(() => true);
    }
}
