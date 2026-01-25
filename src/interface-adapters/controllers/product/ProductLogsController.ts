/**
 * ProductLogsController - V15 Product controller for activity logs and journal.
 *
 * Provides activity and journal operations for the product UI.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RouteParams } from '../../routing/Router.js';
import { ActivityProjectionService, IActivityLogRepository, IJournalEntryRepository } from '../../../application/projections/ActivityProjectionService.js';
import { IActivityLog } from '../../../domain/entities/ActivityLog.js';
import { IJournalEntry } from '../../../domain/entities/JournalEntry.js';
import { paginate, parsePaginationQuery } from '../../../shared/types/Pagination.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';

/**
 * Controller for product activity and journal operations.
 */
export class ProductLogsController {
    constructor(
        private readonly activityProjection: ActivityProjectionService,
        private readonly activityLogRepository: IActivityLogRepository,
        private readonly journalEntryRepository: IJournalEntryRepository
    ) {}

    /**
     * List activity logs with optional filtering.
     * GET /app/activity?page=&pageSize=&dateFrom=&dateTo=
     */
    async listActivity(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            // Parse filters
            const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
            const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

            const allLogs = await this.activityProjection.buildAllActivityLogReadModels({
                dateFrom,
                dateTo,
            });

            // Paginate
            const paginationQuery = parsePaginationQuery(query);
            const result = paginate(allLogs, paginationQuery);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Create an activity log entry.
     * POST /app/logs/activity
     * Body: { type, description, taskId?, goalId?, durationMinutes?, timestamp? }
     */
    async logActivity(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);

            // Validate required fields
            if (!body.description) {
                sendApiError(res, ApiError.validation('Missing required field: description'), correlationId);
                return;
            }

            const timestamp = body.timestamp ? new Date(body.timestamp as string) : new Date();

            const log: IActivityLog = {
                id: IdGenerator.generate(),
                taskId: body.taskId as string | undefined,
                goalId: body.goalId as string | undefined,
                timestamp,
                description: body.description as string,
                durationMinutes: body.durationMinutes as number ?? 0,
            };

            await this.activityLogRepository.save(log);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                id: log.id,
                type: 'manual_log',
                description: log.description,
                timestamp: log.timestamp.toISOString(),
                durationMinutes: log.durationMinutes,
                taskId: log.taskId,
                goalId: log.goalId,
            }));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * List journal entries with optional filtering.
     * GET /app/journal?page=&pageSize=&dateFrom=&dateTo=
     */
    async listJournal(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            // Parse filters
            const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
            const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

            const allEntries = await this.activityProjection.buildAllJournalEntryReadModels({
                dateFrom,
                dateTo,
            });

            // Paginate
            const paginationQuery = parsePaginationQuery(query);
            const result = paginate(allEntries, paginationQuery);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Create a journal entry.
     * POST /app/logs/journal
     * Body: { content, tags?, date? }
     */
    async writeJournal(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);

            // Validate required fields
            if (!body.content) {
                sendApiError(res, ApiError.validation('Missing required field: content'), correlationId);
                return;
            }

            const date = body.date ? new Date(body.date as string) : new Date();
            const now = new Date();

            const entry: IJournalEntry = {
                id: IdGenerator.generate(),
                date,
                content: body.content as string,
                tags: (body.tags as string[]) ?? [],
                imageUrls: body.imageUrls as string[] | undefined,
                audioUrls: body.audioUrls as string[] | undefined,
                createdAt: now,
            };

            await this.journalEntryRepository.save(entry);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                id: entry.id,
                content: entry.content,
                date: entry.date.toISOString().split('T')[0],
                tags: entry.tags,
                imageUrls: entry.imageUrls,
                audioUrls: entry.audioUrls,
                createdAt: entry.createdAt.toISOString(),
            }));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Get activity summary for a date range.
     * GET /app/activity/summary?dateFrom=&dateTo=
     */
    async getActivitySummary(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            // Default to last 7 days
            const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
            const dateFrom = query.dateFrom
                ? new Date(query.dateFrom)
                : new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

            const summary = await this.activityProjection.buildActivitySummary(dateFrom, dateTo);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(summary));
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
