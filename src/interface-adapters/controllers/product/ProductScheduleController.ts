/**
 * ProductScheduleController - V15 Product controller for schedule.
 *
 * Provides schedule view and task assignment operations.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RouteParams } from '../../routing/Router.js';
import { ScheduleProjectionService } from '../../../application/projections/ScheduleProjectionService.js';
import { IScheduleRepository } from '../../../application/ports/IScheduleRepository.js';
import { ITaskRepository } from '../../../application/ports/ITaskRepository.js';
import { IScheduleBlock } from '../../../domain/entities/ScheduleBlock.js';
import { TimeRange } from '../../../domain/value-objects/TimeRange.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';

/**
 * Controller for product schedule operations.
 */
export class ProductScheduleController {
    constructor(
        private readonly scheduleProjection: ScheduleProjectionService,
        private readonly scheduleRepository: IScheduleRepository,
        private readonly taskRepository: ITaskRepository
    ) {}

    /**
     * Get schedule for a specific date.
     * GET /app/schedule?date=YYYY-MM-DD
     */
    async getSchedule(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            // Default to today if no date provided
            const dateStr = query.date || new Date().toISOString().split('T')[0];

            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                sendApiError(res, ApiError.validation('Invalid date format. Use YYYY-MM-DD'), correlationId);
                return;
            }

            const schedule = await this.scheduleProjection.buildScheduleForDate(dateStr);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(schedule));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Assign a task to the schedule.
     * POST /app/schedule/assign
     * Body: { taskId, startTime, endTime }
     */
    async assignTask(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);

            // Validate required fields
            if (!body.taskId) {
                sendApiError(res, ApiError.validation('Missing required field: taskId'), correlationId);
                return;
            }
            if (!body.startTime) {
                sendApiError(res, ApiError.validation('Missing required field: startTime'), correlationId);
                return;
            }
            if (!body.endTime) {
                sendApiError(res, ApiError.validation('Missing required field: endTime'), correlationId);
                return;
            }

            // Validate task exists
            const task = await this.taskRepository.findById(body.taskId as string);
            if (!task) {
                sendApiError(res, ApiError.notFound('Task', body.taskId as string), correlationId);
                return;
            }

            // Parse times
            const startTime = new Date(body.startTime as string);
            const endTime = new Date(body.endTime as string);

            // Validate time range
            if (startTime >= endTime) {
                sendApiError(res, ApiError.validation('Start time must be before end time'), correlationId);
                return;
            }

            // Check for conflicts
            const dateStr = startTime.toISOString().split('T')[0];
            const conflicts = await this.scheduleProjection.checkConflicts(
                dateStr,
                startTime.toISOString(),
                endTime.toISOString()
            );

            if (conflicts.hasConflict) {
                sendApiError(
                    res,
                    ApiError.conflict(
                        `Time slot conflicts with existing blocks: ${conflicts.conflictingBlocks.join(', ')}`
                    ),
                    correlationId
                );
                return;
            }

            // Create schedule block
            const block: IScheduleBlock = {
                id: IdGenerator.generate(),
                timeRange: new TimeRange(startTime, endTime),
                taskId: body.taskId as string,
                label: task.title,
                isFixed: false,
            };

            await this.scheduleRepository.saveBlock(block);

            // Return the created block
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                id: block.id,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                label: block.label,
                isFixed: block.isFixed,
                taskId: block.taskId,
            }));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Delete a schedule block.
     * DELETE /app/schedule/:id
     */
    async deleteBlock(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const blockId = params.id;

            // Check if block exists
            const block = await this.scheduleRepository.findById(blockId);
            if (!block) {
                sendApiError(res, ApiError.notFound('Schedule block', blockId), correlationId);
                return;
            }

            // Prevent deleting fixed blocks
            if (block.isFixed) {
                sendApiError(res, ApiError.validation('Cannot delete fixed schedule blocks'), correlationId);
                return;
            }

            await this.scheduleRepository.deleteBlock(blockId);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Find available slots for scheduling.
     * GET /app/schedule/available?date=YYYY-MM-DD&duration=30
     */
    async findAvailableSlots(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            // Default to today if no date provided
            const dateStr = query.date || new Date().toISOString().split('T')[0];
            const duration = parseInt(query.duration || '30', 10);

            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                sendApiError(res, ApiError.validation('Invalid date format. Use YYYY-MM-DD'), correlationId);
                return;
            }

            // Validate duration
            if (isNaN(duration) || duration < 15) {
                sendApiError(res, ApiError.validation('Duration must be at least 15 minutes'), correlationId);
                return;
            }

            const slots = await this.scheduleProjection.findSlotsForDuration(dateStr, duration);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(slots));
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
