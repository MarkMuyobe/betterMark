/**
 * ErrorNormalizer - V14 Convert any error to normalized format.
 *
 * Ensures consistent error responses across the entire API.
 */

import { ServerResponse } from 'http';
import { ApiError, ApiErrorResponse } from './ApiError.js';

/**
 * Normalize any error to an ApiError.
 */
export function normalizeError(error: unknown): ApiError {
    // Already an ApiError
    if (error instanceof ApiError) {
        return error;
    }

    // Standard Error
    if (error instanceof Error) {
        // Check for specific error types
        if (error.message.includes('Invalid JSON')) {
            return ApiError.validation('Invalid JSON body');
        }
        if (error.message.includes('not found')) {
            return ApiError.notFound('Resource');
        }
        // Default to internal error with original message in production
        // would hide the details
        return ApiError.internal(error.message);
    }

    // Unknown error type
    return ApiError.internal('An unexpected error occurred');
}

/**
 * Send a normalized error response.
 */
export function sendErrorResponse(
    res: ServerResponse,
    error: unknown,
    correlationId: string
): void {
    const apiError = normalizeError(error);
    const response = apiError.toResponse(correlationId);

    res.writeHead(apiError.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
}

/**
 * Send an ApiError directly.
 */
export function sendApiError(
    res: ServerResponse,
    error: ApiError,
    correlationId: string
): void {
    const response = error.toResponse(correlationId);
    res.writeHead(error.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
}

/**
 * Create a normalized success response.
 */
export interface SuccessResponse<T> {
    data: T;
    correlationId: string;
}

/**
 * Send a normalized success response.
 */
export function sendSuccessResponse<T>(
    res: ServerResponse,
    data: T,
    correlationId: string,
    statusCode = 200
): void {
    const response: SuccessResponse<T> = {
        data,
        correlationId,
    };
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
}
