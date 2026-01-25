/**
 * ProductTasksController - V15 Product controller for tasks.
 *
 * Provides CRUD operations for tasks in the product UI.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RouteParams } from '../../routing/Router.js';
import { TaskProjectionService } from '../../../application/projections/TaskProjectionService.js';
import { CreateTask } from '../../../application/use-cases/implementation/CreateTask.js';
import { CompleteTask } from '../../../application/use-cases/implementation/CompleteTask.js';
import { paginate, parsePaginationQuery } from '../../../shared/types/Pagination.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';
import { TaskStatus } from '../../../application/read-models/TaskListReadModel.js';

/**
 * Controller for product task operations.
 */
export class ProductTasksController {
    constructor(
        private readonly taskProjection: TaskProjectionService,
        private readonly createTaskUseCase: CreateTask,
        private readonly completeTaskUseCase: CompleteTask
    ) {}

    /**
     * List all tasks with optional filtering.
     * GET /app/tasks?page=&pageSize=&status=&goalId=&dateFrom=&dateTo=
     */
    async list(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            // Parse filters
            const status = query.status as TaskStatus | undefined;
            const goalId = query.goalId;
            const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
            const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

            const allTasks = await this.taskProjection.buildAllTaskListReadModels({
                status,
                goalId,
                dateFrom,
                dateTo,
            });

            // Paginate
            const paginationQuery = parsePaginationQuery(query);
            const result = paginate(allTasks, paginationQuery);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Get a single task by ID.
     * GET /app/tasks/:id
     */
    async get(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const taskId = params.id;
            const task = await this.taskProjection.buildTaskReadModel(taskId);

            if (!task) {
                sendApiError(res, ApiError.notFound('Task', taskId), correlationId);
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(task));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Create a new task.
     * POST /app/tasks
     * Body: { subGoalId, title, description?, difficulty?, estimatedDurationMinutes?, deadline? }
     */
    async create(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);

            // Validate required fields
            if (!body.subGoalId) {
                sendApiError(res, ApiError.validation('Missing required field: subGoalId'), correlationId);
                return;
            }
            if (!body.title) {
                sendApiError(res, ApiError.validation('Missing required field: title'), correlationId);
                return;
            }

            // Validate difficulty if provided
            if (body.difficulty && !Object.values(DifficultyProfile).includes(body.difficulty as DifficultyProfile)) {
                sendApiError(res, ApiError.validation(`Invalid difficulty: ${body.difficulty}`), correlationId);
                return;
            }

            const task = await this.createTaskUseCase.execute({
                subGoalId: body.subGoalId as string,
                title: body.title as string,
                description: body.description as string | undefined,
                difficulty: body.difficulty as DifficultyProfile | undefined,
                estimatedDurationMinutes: body.estimatedDurationMinutes as number | undefined,
                deadline: body.deadline ? new Date(body.deadline as string) : undefined,
            });

            // Return the task as a list read model
            const readModel = await this.taskProjection.buildTaskReadModel(task.id);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(readModel));
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                sendApiError(res, ApiError.notFound('SubGoal', 'specified subGoalId'), correlationId);
                return;
            }
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Complete a task.
     * POST /app/tasks/:id/complete
     */
    async complete(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const taskId = params.id;

            await this.completeTaskUseCase.execute(taskId);

            // Return updated task
            const readModel = await this.taskProjection.buildTaskReadModel(taskId);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(readModel));
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                sendApiError(res, ApiError.notFound('Task', params.id), correlationId);
                return;
            }
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
