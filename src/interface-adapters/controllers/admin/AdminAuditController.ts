/**
 * AdminAuditController - V14 Admin controller for audit trail.
 *
 * Provides read operations for the audit trail with time-bound query limits.
 * V14: Updated with standardized error handling.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RouteParams } from '../../routing/Router.js';
import { AuditTrailProjectionService, AuditTrailQuery } from '../../../application/projections/AuditTrailProjectionService.js';
import { AuditRecordType } from '../../../application/read-models/AuditTrailReadModel.js';
import { paginate, parsePaginationQuery } from '../../../shared/types/Pagination.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';

/**
 * V14: Default time window for audit queries (30 days).
 */
const DEFAULT_AUDIT_WINDOW_DAYS = 30;

/**
 * V14: Maximum time window for audit queries (90 days).
 */
const MAX_AUDIT_WINDOW_DAYS = 90;

/**
 * Controller for admin audit operations.
 */
export class AdminAuditController {
    constructor(
        private readonly auditProjection: AuditTrailProjectionService
    ) {}

    /**
     * List audit trail entries with optional filtering.
     * GET /admin/audit?page=&pageSize=&type=&agent=&since=&until=
     *
     * V14: Added time-bound query limits:
     * - Default: last 30 days
     * - Maximum: 90 days
     */
    async list(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        try {
            // Build query object for audit projection
            const auditQuery: AuditTrailQuery = {};

            if (query.type && this.isValidAuditType(query.type)) {
                auditQuery.type = query.type as AuditRecordType;
            }

            if (query.agent) {
                auditQuery.agentType = query.agent;
            }

            // V14: Time-bound query limits
            const now = new Date();
            let sinceDate: Date;
            let untilDate: Date = now;

            if (query.since) {
                sinceDate = new Date(query.since);
                if (isNaN(sinceDate.getTime())) {
                    return this.sendValidationError(res, 'Invalid since date format');
                }
            } else {
                // V14: Default to last 30 days
                sinceDate = new Date(now.getTime() - DEFAULT_AUDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
            }

            if (query.until) {
                untilDate = new Date(query.until);
                if (isNaN(untilDate.getTime())) {
                    return this.sendValidationError(res, 'Invalid until date format');
                }
            }

            // V14: Validate time window doesn't exceed maximum
            const windowDays = (untilDate.getTime() - sinceDate.getTime()) / (24 * 60 * 60 * 1000);
            if (windowDays > MAX_AUDIT_WINDOW_DAYS) {
                return this.sendValidationError(
                    res,
                    `Time window exceeds maximum of ${MAX_AUDIT_WINDOW_DAYS} days. Current window: ${Math.ceil(windowDays)} days`
                );
            }

            if (sinceDate > untilDate) {
                return this.sendValidationError(res, 'since date must be before until date');
            }

            auditQuery.since = sinceDate;
            auditQuery.until = untilDate;

            const allRecords = await this.auditProjection.buildAllAuditTrailReadModels(auditQuery);

            // Paginate
            const paginationQuery = parsePaginationQuery(query);
            const result = paginate(allRecords, paginationQuery);

            // V14: Include time window metadata in response
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ...result,
                meta: {
                    timeWindow: {
                        since: sinceDate.toISOString(),
                        until: untilDate.toISOString(),
                        days: Math.ceil(windowDays),
                    },
                },
            }));
        } catch (error) {
            sendErrorResponse(res, error, RequestContext.getCorrelationId());
        }
    }

    /**
     * Get audit trail for a specific agent.
     * GET /admin/audit/agent/:agent?page=&pageSize=
     */
    async listByAgent(req: IncomingMessage, res: ServerResponse, { params, query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const agentType = params.agent;
            const records = await this.auditProjection.buildAuditTrailForAgent(agentType);

            // Paginate
            const paginationQuery = parsePaginationQuery(query);
            const result = paginate(records, paginationQuery);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Get audit trail by type.
     * GET /admin/audit/type/:type?page=&pageSize=
     */
    async listByType(req: IncomingMessage, res: ServerResponse, { params, query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const type = params.type;

            if (!this.isValidAuditType(type)) {
                sendApiError(
                    res,
                    ApiError.validation(`Invalid audit type: ${type}. Valid types are: arbitration, adaptation, rollback`),
                    correlationId
                );
                return;
            }

            const records = await this.auditProjection.buildAuditTrailByType(type as AuditRecordType);

            // Paginate
            const paginationQuery = parsePaginationQuery(query);
            const result = paginate(records, paginationQuery);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Check if a type is a valid audit record type.
     */
    private isValidAuditType(type: string): boolean {
        return ['arbitration', 'adaptation', 'rollback'].includes(type);
    }

    /**
     * V14: Helper to send validation error response.
     */
    private sendValidationError(res: ServerResponse, message: string): void {
        sendApiError(res, ApiError.validation(message), RequestContext.getCorrelationId());
    }
}
