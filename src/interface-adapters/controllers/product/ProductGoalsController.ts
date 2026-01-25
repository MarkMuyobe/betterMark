/**
 * ProductGoalsController - V15 Product controller for goals.
 *
 * Provides CRUD operations for goals in the product UI.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RouteParams } from '../../routing/Router.js';
import { GoalProjectionService } from '../../../application/projections/GoalProjectionService.js';
import { CreateGoal, CreateGoalRequest } from '../../../application/use-cases/implementation/CreateGoal.js';
import { UpdateGoal } from '../../../application/use-cases/implementation/UpdateGoal.js';
import { paginate, parsePaginationQuery } from '../../../shared/types/Pagination.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';
import { Facet } from '../../../domain/enums/Facet.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';

/**
 * Controller for product goal operations.
 */
export class ProductGoalsController {
    constructor(
        private readonly goalProjection: GoalProjectionService,
        private readonly createGoalUseCase: CreateGoal,
        private readonly updateGoalUseCase: UpdateGoal
    ) {}

    /**
     * List all goals with optional filtering.
     * GET /app/goals?page=&pageSize=&facet=&status=
     */
    async list(req: IncomingMessage, res: ServerResponse, { query }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            // Parse filters
            const facet = query.facet as Facet | undefined;
            const status = query.status as 'active' | 'completed' | 'all' | undefined;

            const allGoals = await this.goalProjection.buildAllGoalListReadModels({
                facet,
                status,
            });

            // Paginate
            const paginationQuery = parsePaginationQuery(query);
            const result = paginate(allGoals, paginationQuery);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Get a single goal by ID.
     * GET /app/goals/:id
     */
    async get(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const goalId = params.id;
            const goal = await this.goalProjection.buildGoalDetailReadModel(goalId);

            if (!goal) {
                sendApiError(res, ApiError.notFound('Goal', goalId), correlationId);
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(goal));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Create a new goal.
     * POST /app/goals
     * Body: { title, description?, facet, difficulty }
     */
    async create(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);

            // Validate required fields
            if (!body.title) {
                sendApiError(res, ApiError.validation('Missing required field: title'), correlationId);
                return;
            }
            if (!body.facet) {
                sendApiError(res, ApiError.validation('Missing required field: facet'), correlationId);
                return;
            }
            if (!body.difficulty) {
                sendApiError(res, ApiError.validation('Missing required field: difficulty'), correlationId);
                return;
            }

            // Validate facet
            if (!Object.values(Facet).includes(body.facet as Facet)) {
                sendApiError(res, ApiError.validation(`Invalid facet: ${body.facet}`), correlationId);
                return;
            }

            // Validate difficulty
            if (!Object.values(DifficultyProfile).includes(body.difficulty as DifficultyProfile)) {
                sendApiError(res, ApiError.validation(`Invalid difficulty: ${body.difficulty}`), correlationId);
                return;
            }

            const request: CreateGoalRequest = {
                title: body.title as string,
                description: body.description as string | undefined,
                facet: body.facet as Facet,
                difficulty: body.difficulty as DifficultyProfile,
            };

            const goal = await this.createGoalUseCase.execute(request);

            // Return the goal as a list read model format
            const readModel = await this.goalProjection.buildGoalDetailReadModel(goal.id);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(readModel));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Update an existing goal.
     * PATCH /app/goals/:id
     * Body: { title?, description?, facet?, difficulty? }
     */
    async update(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const goalId = params.id;
            const body = await this.readBody(req);

            // Validate facet if provided
            if (body.facet && !Object.values(Facet).includes(body.facet as Facet)) {
                sendApiError(res, ApiError.validation(`Invalid facet: ${body.facet}`), correlationId);
                return;
            }

            // Validate difficulty if provided
            if (body.difficulty && !Object.values(DifficultyProfile).includes(body.difficulty as DifficultyProfile)) {
                sendApiError(res, ApiError.validation(`Invalid difficulty: ${body.difficulty}`), correlationId);
                return;
            }

            const updates: Record<string, unknown> = {};
            if (body.title !== undefined) updates.title = body.title;
            if (body.description !== undefined) updates.description = body.description;
            if (body.facet !== undefined) updates.facet = body.facet;
            if (body.difficulty !== undefined) updates.difficulty = body.difficulty;

            await this.updateGoalUseCase.execute(goalId, updates);

            // Return updated goal
            const readModel = await this.goalProjection.buildGoalDetailReadModel(goalId);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(readModel));
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                sendApiError(res, ApiError.notFound('Goal', params.id), correlationId);
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
