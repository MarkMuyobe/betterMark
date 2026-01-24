/**
 * AdminPreferencesController - V13 Admin controller for preferences.
 *
 * Provides read and control operations for agent preferences.
 * V14: Updated with standardized error handling and metrics.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RouteParams } from '../../routing/Router.js';
import { PreferenceProjectionService } from '../../../application/projections/PreferenceProjectionService.js';
import { RollbackService } from '../../../application/services/RollbackService.js';
import { paginate, parsePaginationQuery, parseQueryString } from '../../../shared/types/Pagination.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';
import { AdminMetrics } from '../../../infrastructure/observability/AdminMetrics.js';

/**
 * Controller for admin preference operations.
 */
export class AdminPreferencesController {
    constructor(
        private readonly preferenceProjection: PreferenceProjectionService,
        private readonly rollbackService: RollbackService,
        private readonly adminMetrics?: AdminMetrics
    ) {}

    /**
     * List all preferences with optional filtering.
     * GET /admin/preferences?page=&pageSize=&agent=
     */
    async list(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const allPreferences = await this.preferenceProjection.buildAllPreferenceReadModels();

            // Filter by agent if specified
            let filtered = allPreferences;
            if (query.agent) {
                filtered = allPreferences.filter(p => p.agentType === query.agent);
            }

            // Paginate
            const paginationQuery = parsePaginationQuery(query);
            const result = paginate(filtered, paginationQuery);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Rollback a preference by preference key.
     * POST /admin/preferences/rollback
     * Body: { agentType: string, preferenceKey: string, reason: string }
     */
    async rollback(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);
            const agentType = body.agentType as string | undefined;
            const preferenceKey = body.preferenceKey as string | undefined;
            const reason = body.reason as string | undefined;

            if (!agentType || !preferenceKey || !reason) {
                this.adminMetrics?.recordValidationError(req.url ?? '/admin/preferences/rollback');
                sendApiError(res, ApiError.validation('Missing required fields: agentType, preferenceKey, reason'), correlationId);
                return;
            }

            const result = await this.rollbackService.rollbackByPreference(agentType, preferenceKey, reason);

            // V14: Record rollback action
            if (result.success) {
                this.adminMetrics?.recordRollback('preference');
            }

            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
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
                    reject(new Error('Invalid JSON body'));
                }
            });
            req.on('error', reject);
        });
    }
}
