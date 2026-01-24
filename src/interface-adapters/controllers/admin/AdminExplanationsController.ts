/**
 * AdminExplanationsController - V13 Admin controller for decision explanations.
 *
 * Provides read operations for explaining decisions.
 * V14: Updated with standardized error handling.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RouteParams } from '../../routing/Router.js';
import { DecisionExplanationService } from '../../../application/services/DecisionExplanationService.js';
import { RequestContext } from '../../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { sendApiError, sendErrorResponse } from '../../../shared/errors/ErrorNormalizer.js';

/**
 * Controller for admin explanation operations.
 */
export class AdminExplanationsController {
    constructor(
        private readonly explanationService: DecisionExplanationService
    ) {}

    /**
     * Get explanation for a decision.
     * GET /admin/explanations/:id
     */
    async getExplanation(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const decisionId = params.id;

            const explanation = await this.explanationService.explainDecision(decisionId);

            if (!explanation) {
                sendApiError(res, ApiError.notFound('Decision', decisionId), correlationId);
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: explanation,
            }));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Get explanation for an arbitration decision specifically.
     * GET /admin/explanations/arbitration/:id
     */
    async getArbitrationExplanation(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const decisionId = params.id;

            const explanation = await this.explanationService.explainArbitrationDecision(decisionId);

            if (!explanation) {
                sendApiError(res, ApiError.notFound('Arbitration decision', decisionId), correlationId);
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: explanation,
            }));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }

    /**
     * Get explanation for an adaptation attempt specifically.
     * GET /admin/explanations/adaptation/:id
     */
    async getAdaptationExplanation(req: IncomingMessage, res: ServerResponse, { params }: RouteParams): Promise<void> {
        const correlationId = RequestContext.getCorrelationId();

        try {
            const attemptId = params.id;

            const explanation = await this.explanationService.explainAdaptationAttempt(attemptId);

            if (!explanation) {
                sendApiError(res, ApiError.notFound('Adaptation attempt', attemptId), correlationId);
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: explanation,
            }));
        } catch (error) {
            sendErrorResponse(res, error, correlationId);
        }
    }
}
