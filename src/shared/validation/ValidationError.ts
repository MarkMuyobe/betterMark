/**
 * ValidationError - V14 Validation-specific error class.
 *
 * Extends ApiError with validation-specific details.
 */

import { ApiError } from '../errors/ApiError.js';
import { ValidationFieldError } from './ValidationSchema.js';

/**
 * Validation error with field-level details.
 */
export class ValidationError extends ApiError {
    readonly fieldErrors: ValidationFieldError[];

    constructor(message: string, fieldErrors: ValidationFieldError[] = []) {
        super('VALIDATION_ERROR', message, {
            fields: fieldErrors.map(e => ({
                field: e.field,
                message: e.message,
            })),
        });
        this.name = 'ValidationError';
        this.fieldErrors = fieldErrors;

        // Ensure proper prototype chain
        Object.setPrototypeOf(this, ValidationError.prototype);
    }

    /**
     * Create a validation error for missing required fields.
     */
    static missingFields(fields: string[]): ValidationError {
        const fieldErrors = fields.map(field => ({
            field,
            message: `${field} is required`,
        }));
        return new ValidationError(
            `Missing required fields: ${fields.join(', ')}`,
            fieldErrors
        );
    }

    /**
     * Create a validation error for invalid field types.
     */
    static invalidType(field: string, expected: string, actual: string): ValidationError {
        return new ValidationError(
            `Invalid type for ${field}: expected ${expected}, got ${actual}`,
            [{ field, message: `Expected ${expected}, got ${actual}` }]
        );
    }

    /**
     * Create a validation error for unknown fields.
     */
    static unknownFields(fields: string[]): ValidationError {
        const fieldErrors = fields.map(field => ({
            field,
            message: `Unknown field: ${field}`,
        }));
        return new ValidationError(
            `Unknown fields: ${fields.join(', ')}`,
            fieldErrors
        );
    }

    /**
     * Create a validation error for value out of range.
     */
    static outOfRange(field: string, min?: number, max?: number, actual?: number): ValidationError {
        let message = `${field} is out of range`;
        if (min !== undefined && max !== undefined) {
            message = `${field} must be between ${min} and ${max}`;
        } else if (min !== undefined) {
            message = `${field} must be at least ${min}`;
        } else if (max !== undefined) {
            message = `${field} must be at most ${max}`;
        }
        return new ValidationError(message, [{
            field,
            message,
            value: actual,
        }]);
    }

    /**
     * Create a validation error for invalid format.
     */
    static invalidFormat(field: string, format: string): ValidationError {
        return new ValidationError(
            `Invalid format for ${field}: expected ${format}`,
            [{ field, message: `Expected format: ${format}` }]
        );
    }

    /**
     * Create a validation error for invalid enum value.
     */
    static invalidEnum(field: string, allowed: readonly (string | number | boolean)[], actual: unknown): ValidationError {
        return new ValidationError(
            `Invalid value for ${field}: must be one of [${allowed.join(', ')}]`,
            [{ field, message: `Must be one of [${allowed.join(', ')}]`, value: actual }]
        );
    }

    /**
     * Create a validation error from multiple field errors.
     */
    static fromFieldErrors(fieldErrors: ValidationFieldError[]): ValidationError {
        if (fieldErrors.length === 0) {
            return new ValidationError('Validation failed');
        }
        if (fieldErrors.length === 1) {
            return new ValidationError(fieldErrors[0].message, fieldErrors);
        }
        return new ValidationError(
            `Validation failed: ${fieldErrors.map(e => e.message).join('; ')}`,
            fieldErrors
        );
    }
}
