/**
 * ProductRouter - V15 Product UI routing.
 *
 * Wires up all product endpoints with session-based authentication.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { Router } from './Router.js';
import { SessionAuth } from '../../infrastructure/auth/SessionAuth.js';
import { IdempotencyMiddleware } from '../middleware/IdempotencyMiddleware.js';
import { TimeoutMiddleware } from '../middleware/TimeoutMiddleware.js';
import { ProductGoalsController } from '../controllers/product/ProductGoalsController.js';
import { ProductSubGoalsController } from '../controllers/product/ProductSubGoalsController.js';
import { ProductTasksController } from '../controllers/product/ProductTasksController.js';
import { ProductScheduleController } from '../controllers/product/ProductScheduleController.js';
import { ProductLogsController } from '../controllers/product/ProductLogsController.js';
import { ProductSuggestionsController } from '../controllers/product/ProductSuggestionsController.js';
import { RequestContext } from '../../infrastructure/observability/RequestContext.js';
import { withCorrelation } from '../../infrastructure/observability/CorrelationMiddleware.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { sendApiError } from '../../shared/errors/ErrorNormalizer.js';
import { AdminMetrics } from '../../infrastructure/observability/AdminMetrics.js';

/**
 * Product router dependencies.
 */
export interface ProductRouterDependencies {
    goalsController: ProductGoalsController;
    subGoalsController: ProductSubGoalsController;
    tasksController: ProductTasksController;
    scheduleController: ProductScheduleController;
    logsController: ProductLogsController;
    suggestionsController?: ProductSuggestionsController; // V16
    sessionAuth: SessionAuth;
    idempotencyMiddleware: IdempotencyMiddleware;
    timeoutMiddleware: TimeoutMiddleware;
    adminMetrics?: AdminMetrics;
}

/**
 * Router for product UI endpoints.
 */
export class ProductRouter {
    private router: Router;
    private sessionAuth: SessionAuth;
    private idempotencyMiddleware: IdempotencyMiddleware;
    private timeoutMiddleware: TimeoutMiddleware;
    private adminMetrics?: AdminMetrics;

    constructor(private readonly dependencies: ProductRouterDependencies) {
        this.router = new Router('/app');
        this.sessionAuth = dependencies.sessionAuth;
        this.idempotencyMiddleware = dependencies.idempotencyMiddleware;
        this.timeoutMiddleware = dependencies.timeoutMiddleware;
        this.adminMetrics = dependencies.adminMetrics;

        this.setupRoutes();
    }

    /**
     * Setup all product routes.
     */
    private setupRoutes(): void {
        const {
            goalsController,
            subGoalsController,
            tasksController,
            scheduleController,
            logsController,
        } = this.dependencies;

        // Goals routes
        this.router.get('/goals', (req, res, params) =>
            goalsController.list(req, res, params)
        );
        this.router.get('/goals/:id', (req, res, params) =>
            goalsController.get(req, res, params)
        );
        this.router.post('/goals', (req, res) =>
            goalsController.create(req, res)
        );
        this.router.put('/goals/:id', (req, res, params) =>
            goalsController.update(req, res, params)
        );

        // SubGoals routes
        this.router.post('/subgoals', (req, res) =>
            subGoalsController.create(req, res)
        );

        // Tasks routes
        this.router.get('/tasks', (req, res, params) =>
            tasksController.list(req, res, params)
        );
        this.router.get('/tasks/:id', (req, res, params) =>
            tasksController.get(req, res, params)
        );
        this.router.post('/tasks', (req, res) =>
            tasksController.create(req, res)
        );
        this.router.post('/tasks/:id/complete', (req, res, params) =>
            tasksController.complete(req, res, params)
        );

        // Schedule routes
        this.router.get('/schedule', (req, res, params) =>
            scheduleController.getSchedule(req, res, params)
        );
        this.router.get('/schedule/available', (req, res, params) =>
            scheduleController.findAvailableSlots(req, res, params)
        );
        this.router.post('/schedule/assign', (req, res) =>
            scheduleController.assignTask(req, res)
        );
        this.router.delete('/schedule/:id', (req, res, params) =>
            scheduleController.deleteBlock(req, res, params)
        );

        // Activity logs routes
        this.router.get('/activity', (req, res, params) =>
            logsController.listActivity(req, res, params)
        );
        this.router.get('/activity/summary', (req, res, params) =>
            logsController.getActivitySummary(req, res, params)
        );
        this.router.post('/logs/activity', (req, res) =>
            logsController.logActivity(req, res)
        );

        // Journal routes
        this.router.get('/journal', (req, res, params) =>
            logsController.listJournal(req, res, params)
        );
        this.router.post('/logs/journal', (req, res) =>
            logsController.writeJournal(req, res)
        );

        // V16 Suggestion surface routes
        const suggestionsController = this.dependencies.suggestionsController;
        if (suggestionsController) {
            this.router.get('/suggestions/surface/:context', (req, res, params) =>
                suggestionsController.getSuggestionForContext(req, res, params)
            );
            this.router.get('/suggestions/explanation/:decisionId', (req, res, params) =>
                suggestionsController.getExplanation(req, res, params)
            );
            this.router.post('/suggestions/:suggestionId/action', (req, res, params) =>
                suggestionsController.executeAction(req, res, params)
            );
            this.router.post('/suggestions/dismiss', (req, res) =>
                suggestionsController.dismiss(req, res)
            );
        }
    }

    /**
     * Check if route requires authentication.
     * For MVP single-user, auth is disabled by default.
     * Set REQUIRE_PRODUCT_AUTH=true to enable.
     */
    private requiresAuth(_url: string): boolean {
        // MVP: Disable auth for single-user mode
        // Enable via environment variable for production
        return process.env.REQUIRE_PRODUCT_AUTH === 'true';
    }

    /**
     * Try to handle a request.
     * Returns true if the request was handled (matched a route).
     */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = req.url ?? '';
        const method = req.method ?? 'GET';

        // Only handle /app/* routes
        if (!url.startsWith('/app')) {
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
                // Check session authentication if required
                if (this.requiresAuth(url)) {
                    const session = this.sessionAuth.handleAuth(req, res);
                    if (!session) {
                        // Auth failed, response already sent
                        this.adminMetrics?.recordAuthFailure('invalid');
                        return;
                    }
                }

                // Check idempotency for mutations
                const idempotencyResult = this.idempotencyMiddleware.handleIdempotency(req, res);
                if (idempotencyResult.cached) {
                    this.adminMetrics?.recordIdempotencyCacheHit();
                    return;
                }

                // Apply timeout middleware
                const timeoutResult = await this.timeoutMiddleware.withTimeout(res, method, async () => {
                    // Route the request
                    const handled = await this.router.handle(req, res);

                    if (!handled) {
                        // Product route prefix matched but no specific route found
                        sendApiError(res, ApiError.notFound('Product endpoint', url), correlationId);
                    }

                    return handled;
                });

                // If timeout occurred, response was already sent
                if (timeoutResult === undefined) {
                    return;
                }
            } finally {
                // Record request metrics
                const durationMs = Date.now() - startTime;
                this.adminMetrics?.recordRequest(method, url, statusCode, durationMs);
            }
        }).then(() => true);
    }
}
