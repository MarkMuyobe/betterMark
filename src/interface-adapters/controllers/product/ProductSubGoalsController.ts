/**
 * ProductSubGoalsController - V15 Product controller for subgoals.
 *
 * Provides create operation for subgoals in the product UI.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { CreateSubGoal } from '../../../application/use-cases/implementation/CreateSubGoal.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';

/**
 * SubGoal read model for responses.
 */
export interface SubGoalReadModel {
    id: string;
    title: string;
    description?: string;
    goalId: string;
    isCompleted: boolean;
    taskCount: number;
}

/**
 * Controller for product subgoal operations.
 */
export class ProductSubGoalsController {
    constructor(
        private readonly createSubGoalUseCase: CreateSubGoal
    ) {}

    /**
     * Create a new subgoal.
     * POST /app/subgoals
     * Body: { goalId, title, description? }
     */
    async create(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const body = await this.readBody(req);

            // Validate required fields
            if (!body.goalId) {
                sendApiError(res, ApiError.validation('Missing required field: goalId'), correlationId);
                return;
            }
            if (!body.title) {
                sendApiError(res, ApiError.validation('Missing required field: title'), correlationId);
                return;
            }

            const subGoal = await this.createSubGoalUseCase.execute({
                goalId: body.goalId as string,
                title: body.title as string,
                description: body.description as string | undefined,
            });

            const readModel: SubGoalReadModel = {
                id: subGoal.id,
                title: subGoal.title,
                description: subGoal.description,
                goalId: subGoal.goalId,
                isCompleted: subGoal.isCompleted,
                taskCount: subGoal.taskIds.length,
            };

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(readModel));
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                sendApiError(res, ApiError.notFound('Goal', 'specified goalId'), correlationId);
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
