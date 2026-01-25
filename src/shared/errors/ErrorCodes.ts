/**
 * ErrorCodes - V14 Error code constants.
 *
 * Standardized error codes for the admin API and beyond.
 */

/**
 * Authentication error codes.
 */
export const AUTH_MISSING = 'AUTH_MISSING';
export const AUTH_INVALID = 'AUTH_INVALID';
export const AUTH_EXPIRED = 'AUTH_EXPIRED';
export const FORBIDDEN = 'FORBIDDEN';

/**
 * Validation error codes.
 */
export const VALIDATION_ERROR = 'VALIDATION_ERROR';

/**
 * Resource error codes.
 */
export const NOT_FOUND = 'NOT_FOUND';
export const CONFLICT = 'CONFLICT';

/**
 * Operational error codes.
 */
export const TIMEOUT = 'TIMEOUT';
export const INTERNAL_ERROR = 'INTERNAL_ERROR';

/**
 * Idempotency error codes.
 */
export const IDEMPOTENCY_KEY_MISSING = 'IDEMPOTENCY_KEY_MISSING';
export const IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT';

/**
 * Service error codes.
 */
export const SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE';
export const CIRCUIT_OPEN = 'CIRCUIT_OPEN';

/**
 * Error code type for type safety.
 */
export type ErrorCode =
    | typeof AUTH_MISSING
    | typeof AUTH_INVALID
    | typeof AUTH_EXPIRED
    | typeof FORBIDDEN
    | typeof VALIDATION_ERROR
    | typeof NOT_FOUND
    | typeof CONFLICT
    | typeof TIMEOUT
    | typeof INTERNAL_ERROR
    | typeof IDEMPOTENCY_KEY_MISSING
    | typeof IDEMPOTENCY_CONFLICT
    | typeof SERVICE_UNAVAILABLE
    | typeof CIRCUIT_OPEN;

/**
 * Map error codes to HTTP status codes.
 */
export const ERROR_CODE_TO_STATUS: Record<ErrorCode, number> = {
    [AUTH_MISSING]: 401,
    [AUTH_INVALID]: 401,
    [AUTH_EXPIRED]: 401,
    [FORBIDDEN]: 403,
    [VALIDATION_ERROR]: 400,
    [NOT_FOUND]: 404,
    [CONFLICT]: 409,
    [TIMEOUT]: 503,
    [INTERNAL_ERROR]: 500,
    [IDEMPOTENCY_KEY_MISSING]: 400,
    [IDEMPOTENCY_CONFLICT]: 409,
    [SERVICE_UNAVAILABLE]: 503,
    [CIRCUIT_OPEN]: 503,
};
