/**
 * ApiError - V14 Base error class for API responses.
 *
 * Provides consistent error structure with code, message, and optional details.
 */

import { ErrorCode, ERROR_CODE_TO_STATUS, INTERNAL_ERROR } from './ErrorCodes.js';

/**
 * Normalized error response structure.
 */
export interface ApiErrorResponse {
    error: {
        code: string;
        message: string;
        details?: unknown;
        correlationId: string;
    };
}

/**
 * API error with standardized structure.
 */
export class ApiError extends Error {
    readonly code: ErrorCode;
    readonly statusCode: number;
    readonly details?: unknown;

    constructor(code: ErrorCode, message: string, details?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.statusCode = ERROR_CODE_TO_STATUS[code] ?? 500;
        this.details = details;

        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, ApiError.prototype);
    }

    /**
     * Convert to normalized response format.
     */
    toResponse(correlationId: string): ApiErrorResponse {
        return {
            error: {
                code: this.code,
                message: this.message,
                details: this.details,
                correlationId,
            },
        };
    }

    /**
     * Create an authentication missing error.
     */
    static authMissing(message = 'Authentication required'): ApiError {
        return new ApiError('AUTH_MISSING', message);
    }

    /**
     * Create an authentication invalid error.
     */
    static authInvalid(message = 'Invalid credentials'): ApiError {
        return new ApiError('AUTH_INVALID', message);
    }

    /**
     * Create an authentication expired error.
     */
    static authExpired(message = 'Token expired'): ApiError {
        return new ApiError('AUTH_EXPIRED', message);
    }

    /**
     * Create a forbidden error.
     */
    static forbidden(message = 'Access denied'): ApiError {
        return new ApiError('FORBIDDEN', message);
    }

    /**
     * Create a validation error.
     */
    static validation(message: string, details?: unknown): ApiError {
        return new ApiError('VALIDATION_ERROR', message, details);
    }

    /**
     * Create a not found error.
     */
    static notFound(resource: string, id?: string): ApiError {
        const message = id
            ? `${resource} not found: ${id}`
            : `${resource} not found`;
        return new ApiError('NOT_FOUND', message);
    }

    /**
     * Create a conflict error.
     */
    static conflict(message: string, details?: unknown): ApiError {
        return new ApiError('CONFLICT', message, details);
    }

    /**
     * Create a timeout error.
     */
    static timeout(message = 'Request timeout'): ApiError {
        return new ApiError('TIMEOUT', message);
    }

    /**
     * Create an internal error.
     */
    static internal(message = 'Internal server error'): ApiError {
        return new ApiError('INTERNAL_ERROR', message);
    }

    /**
     * Create a service unavailable error.
     */
    static serviceUnavailable(message = 'Service temporarily unavailable'): ApiError {
        return new ApiError('SERVICE_UNAVAILABLE', message);
    }

    /**
     * Create a circuit open error.
     */
    static circuitOpen(service: string): ApiError {
        return new ApiError('CIRCUIT_OPEN', `Service ${service} is temporarily unavailable`);
    }

    /**
     * Create an idempotency key missing error.
     */
    static idempotencyKeyMissing(): ApiError {
        return new ApiError('IDEMPOTENCY_KEY_MISSING', 'X-Idempotency-Key header is required for this operation');
    }

    /**
     * Create an idempotency conflict error.
     */
    static idempotencyConflict(message = 'Request with same idempotency key is already being processed'): ApiError {
        return new ApiError('IDEMPOTENCY_CONFLICT', message);
    }
}
