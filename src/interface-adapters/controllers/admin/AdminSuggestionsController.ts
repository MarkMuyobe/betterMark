/**
 * AdminSuggestionsController - V13 Admin controller for suggestions.
 *
 * Provides read and control operations for preference suggestions.
 * V14: Updated with standardized error handling and metrics.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RouteParams } from '../../routing/Router.js';
import { SuggestionProjectionService } from '../../../application/projections/SuggestionProjectionService.js';
import { SuggestionApprovalService } from '../../../application/services/SuggestionApprovalService.js';
import { paginate, parsePaginationQuery } from '../../../shared/types/Pagination.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';
import { AdminMetrics } from '../../../infrastructure/observability/AdminMetrics.js';

/**
 * Controller for admin suggestion operations.
 */
export class AdminSuggestionsController {
    constructor(
        private readonly suggestionProjection: SuggestionProjectionService,
        private readonly suggestionApproval: SuggestionApprovalService,
        private readonly adminMetrics?: AdminMetrics
    ) {}

    /**
     * List all suggestions with optional filtering.
     * GET /admin/suggestions?page=&pageSize=&status=&agent=
     */
    async list(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const allSuggestions = await this.suggestionProjection.buildAllSuggestionReadModels();

            // Filter by status if specified
            let filtered = allSuggestions;
            if (query.status) {
                filtered = filtered.filter(s => s.status === query.status);
            }

            // Filter by agent if specified
            if (query.agent) {
                filtered = filtered.filter(s => s.agentType === query.agent);
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
     * Approve a suggestion.
     * POST /admin/suggestions/:id/approve
     * Body: { agentType: string }
     */
    async approve(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);
            const suggestionId = params.id;
            const agentType = body.agentType as string;

            if (!agentType) {
                this.adminMetrics?.recordValidationError(req.url ?? '/admin/suggestions/:id/approve');
                sendApiError(res, ApiError.validation('Missing required field: agentType'), correlationId);
                return;
            }

            const result = await this.suggestionApproval.approveSuggestion(agentType, suggestionId);

            // V14: Record mutation action
            if (result.success) {
                this.adminMetrics?.recordMutationAction('suggestion_approve');
            }

            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Reject a suggestion.
     * POST /admin/suggestions/:id/reject
     * Body: { agentType: string, reason: string }
     */
    async reject(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);
            const suggestionId = params.id;
            const agentType = body.agentType as string;
            const reason = body.reason as string;

            if (!agentType || !reason) {
                this.adminMetrics?.recordValidationError(req.url ?? '/admin/suggestions/:id/reject');
                sendApiError(res, ApiError.validation('Missing required fields: agentType, reason'), correlationId);
                return;
            }

            const result = await this.suggestionApproval.rejectSuggestion(agentType, suggestionId, reason);

            // V14: Record mutation action
            if (result.success) {
                this.adminMetrics?.recordMutationAction('suggestion_reject');
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
