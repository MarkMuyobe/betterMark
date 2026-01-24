/**
 * AdminArbitrationsController - V13 Admin controller for arbitration decisions.
 *
 * Provides read and control operations for arbitration decisions and escalations.
 * V14: Updated with standardized error handling and metrics.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RouteParams } from '../../routing/Router.js';
import { ArbitrationDecisionProjectionService } from '../../../application/projections/ArbitrationDecisionProjectionService.js';
import { EscalationApprovalService } from '../../../application/services/EscalationApprovalService.js';
import { RollbackService } from '../../../application/services/RollbackService.js';
import { paginate, parsePaginationQuery } from '../../../shared/types/Pagination.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';
import { AdminMetrics } from '../../../infrastructure/observability/AdminMetrics.js';

/**
 * Controller for admin arbitration operations.
 */
export class AdminArbitrationsController {
    constructor(
        private readonly arbitrationProjection: ArbitrationDecisionProjectionService,
        private readonly escalationApproval: EscalationApprovalService,
        private readonly rollbackService: RollbackService,
        private readonly adminMetrics?: AdminMetrics
    ) {}

    /**
     * List all arbitration decisions with optional filtering.
     * GET /admin/arbitrations?page=&pageSize=&escalated=
     */
    async list(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const allDecisions = await this.arbitrationProjection.buildAllArbitrationDecisionReadModels();

            // Filter by escalated if specified
            let filtered = allDecisions;
            if (query.escalated !== undefined) {
                const escalated = query.escalated === 'true';
                filtered = filtered.filter(d => d.escalated === escalated);
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
     * Get pending escalations.
     * GET /admin/escalations/pending
     */
    async listPending(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const pendingDecisions = await this.arbitrationProjection.buildPendingApprovalReadModels();

            // Paginate
            const paginationQuery = parsePaginationQuery(query);
            const result = paginate(pendingDecisions, paginationQuery);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Approve an escalated decision.
     * POST /admin/escalations/:id/approve
     * Body: { approvedBy?: string, selectedProposalId?: string }
     */
    async approveEscalation(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);
            const decisionId = params.id;
            const approvedBy = (body.approvedBy as string) ?? 'admin';
            const selectedProposalId = body.selectedProposalId as string | undefined;

            const result = await this.escalationApproval.approveEscalatedDecision(
                decisionId,
                approvedBy,
                selectedProposalId
            );

            // V14: Record mutation action
            if (result.success) {
                this.adminMetrics?.recordMutationAction('escalation_approve');
            }

            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Reject an escalated decision.
     * POST /admin/escalations/:id/reject
     * Body: { reason: string, rejectedBy?: string }
     */
    async rejectEscalation(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);
            const decisionId = params.id;
            const reason = body.reason as string;
            const rejectedBy = (body.rejectedBy as string) ?? 'admin';

            if (!reason) {
                this.adminMetrics?.recordValidationError(req.url ?? '/admin/escalations/:id/reject');
                sendApiError(res, ApiError.validation('Missing required field: reason'), correlationId);
                return;
            }

            const result = await this.escalationApproval.rejectEscalatedDecision(
                decisionId,
                reason,
                rejectedBy
            );

            // V14: Record mutation action
            if (result.success) {
                this.adminMetrics?.recordMutationAction('escalation_reject');
            }

            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Rollback by decision ID.
     * POST /admin/arbitrations/:id/rollback
     * Body: { reason: string }
     */
    async rollbackDecision(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);
            const decisionId = params.id;
            const reason = body.reason as string;

            if (!reason) {
                this.adminMetrics?.recordValidationError(req.url ?? '/admin/arbitrations/:id/rollback');
                sendApiError(res, ApiError.validation('Missing required field: reason'), correlationId);
                return;
            }

            const result = await this.rollbackService.rollbackByDecision(decisionId, reason);

            // V14: Record rollback action
            if (result.success) {
                this.adminMetrics?.recordRollback('arbitration');
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
