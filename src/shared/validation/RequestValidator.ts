/**
 * RequestValidator - V14 Validation helper function.
 *
 * Validates request bodies against schemas.
 */

import {
    ValidationSchema,
    FieldRule,
    ValidationResult,
    ValidationFieldError,
    SchemaOptions,
} from './ValidationSchema.js';
import { ValidationError } from './ValidationError.js';

/**
 * Default maximum string length.
 */
const MAX_STRING_LENGTH = 500;

/**
 * Default maximum array length.
 */
const MAX_ARRAY_LENGTH = 100;

/**
 * Validate a value against a schema.
 */
export function validate(
    data: unknown,
    schema: ValidationSchema,
    options: SchemaOptions = {}
): ValidationResult {
    const errors: ValidationFieldError[] = [];
    const { rejectUnknown = true, isMutation = false } = options;

    if (typeof data !== 'object' || data === null) {
        errors.push({
            field: '$root',
            message: 'Request body must be an object',
            value: data,
        });
        return { valid: false, errors };
    }

    const dataObj = data as Record<string, unknown>;
    const schemaKeys = new Set(Object.keys(schema));

    // Check for unknown fields (for mutations)
    if (rejectUnknown && isMutation) {
        const unknownFields = Object.keys(dataObj).filter(key => !schemaKeys.has(key));
        if (unknownFields.length > 0) {
            errors.push(...unknownFields.map(field => ({
                field,
                message: `Unknown field: ${field}`,
            })));
        }
    }

    // Validate each field in schema
    for (const [fieldName, rule] of Object.entries(schema)) {
        const value = dataObj[fieldName];
        const fieldErrors = validateField(fieldName, value, rule);
        errors.push(...fieldErrors);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validate a single field against a rule.
 */
function validateField(
    fieldName: string,
    value: unknown,
    rule: FieldRule
): ValidationFieldError[] {
    const errors: ValidationFieldError[] = [];

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} is required`,
        });
        return errors;
    }

    // Skip further validation if value is not provided and not required
    if (value === undefined || value === null) {
        return errors;
    }

    // Validate type
    const typeErrors = validateType(fieldName, value, rule);
    errors.push(...typeErrors);

    // If type is wrong, skip further validation
    if (typeErrors.length > 0) {
        return errors;
    }

    // Type-specific validation
    switch (rule.type) {
        case 'string':
            errors.push(...validateString(fieldName, value as string, rule));
            break;
        case 'number':
            errors.push(...validateNumber(fieldName, value as number, rule));
            break;
        case 'array':
            errors.push(...validateArray(fieldName, value as unknown[], rule));
            break;
        case 'object':
            errors.push(...validateObject(fieldName, value as Record<string, unknown>, rule));
            break;
    }

    // Validate enum
    if (rule.enum && !rule.enum.includes(value as string | number | boolean)) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} must be one of [${rule.enum.join(', ')}]`,
            value,
        });
    }

    return errors;
}

/**
 * Validate value type.
 */
function validateType(
    fieldName: string,
    value: unknown,
    rule: FieldRule
): ValidationFieldError[] {
    const errors: ValidationFieldError[] = [];
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (actualType !== rule.type) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} must be a ${rule.type}, got ${actualType}`,
            value,
        });
    }

    return errors;
}

/**
 * Validate string field.
 */
function validateString(
    fieldName: string,
    value: string,
    rule: FieldRule
): ValidationFieldError[] {
    const errors: ValidationFieldError[] = [];
    const maxLen = rule.max ?? MAX_STRING_LENGTH;

    // Length validation
    if (rule.min !== undefined && value.length < rule.min) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} must be at least ${rule.min} characters`,
            value,
        });
    }

    if (value.length > maxLen) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} must be at most ${maxLen} characters`,
            value: `(${value.length} chars)`,
        });
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(value)) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} has invalid format`,
            value,
        });
    }

    return errors;
}

/**
 * Validate number field.
 */
function validateNumber(
    fieldName: string,
    value: number,
    rule: FieldRule
): ValidationFieldError[] {
    const errors: ValidationFieldError[] = [];

    if (!Number.isFinite(value)) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} must be a finite number`,
            value,
        });
        return errors;
    }

    if (rule.min !== undefined && value < rule.min) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} must be at least ${rule.min}`,
            value,
        });
    }

    if (rule.max !== undefined && value > rule.max) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} must be at most ${rule.max}`,
            value,
        });
    }

    return errors;
}

/**
 * Validate array field.
 */
function validateArray(
    fieldName: string,
    value: unknown[],
    rule: FieldRule
): ValidationFieldError[] {
    const errors: ValidationFieldError[] = [];
    const maxLen = rule.max ?? MAX_ARRAY_LENGTH;

    // Length validation
    if (rule.min !== undefined && value.length < rule.min) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} must have at least ${rule.min} items`,
            value: `(${value.length} items)`,
        });
    }

    if (value.length > maxLen) {
        errors.push({
            field: fieldName,
            message: rule.message ?? `${fieldName} must have at most ${maxLen} items`,
            value: `(${value.length} items)`,
        });
    }

    // Item validation
    if (rule.items) {
        for (let i = 0; i < value.length; i++) {
            const itemErrors = validateField(`${fieldName}[${i}]`, value[i], rule.items);
            errors.push(...itemErrors);
        }
    }

    return errors;
}

/**
 * Validate object field.
 */
function validateObject(
    fieldName: string,
    value: Record<string, unknown>,
    rule: FieldRule
): ValidationFieldError[] {
    const errors: ValidationFieldError[] = [];

    if (rule.properties) {
        // Check for unknown fields
        if (rule.allowAdditional === false) {
            const schemaKeys = new Set(Object.keys(rule.properties));
            const unknownFields = Object.keys(value).filter(key => !schemaKeys.has(key));
            for (const unknown of unknownFields) {
                errors.push({
                    field: `${fieldName}.${unknown}`,
                    message: `Unknown field: ${fieldName}.${unknown}`,
                });
            }
        }

        // Validate nested fields
        for (const [nestedField, nestedRule] of Object.entries(rule.properties)) {
            const nestedErrors = validateField(
                `${fieldName}.${nestedField}`,
                value[nestedField],
                nestedRule
            );
            errors.push(...nestedErrors);
        }
    }

    return errors;
}

/**
 * Validate request body and throw ValidationError if invalid.
 */
export function validateOrThrow(
    data: unknown,
    schema: ValidationSchema,
    options: SchemaOptions = {}
): void {
    const result = validate(data, schema, options);
    if (!result.valid) {
        throw ValidationError.fromFieldErrors(result.errors);
    }
}

/**
 * Validate pagination query parameters.
 */
export function validatePagination(query: Record<string, string | undefined>): ValidationResult {
    const errors: ValidationFieldError[] = [];

    if (query.page !== undefined) {
        const page = parseInt(query.page, 10);
        if (isNaN(page) || page < 1) {
            errors.push({
                field: 'page',
                message: 'page must be a positive integer',
                value: query.page,
            });
        }
    }

    if (query.pageSize !== undefined) {
        const pageSize = parseInt(query.pageSize, 10);
        if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
            errors.push({
                field: 'pageSize',
                message: 'pageSize must be between 1 and 100',
                value: query.pageSize,
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate pagination and throw if invalid.
 */
export function validatePaginationOrThrow(query: Record<string, string | undefined>): void {
    const result = validatePagination(query);
    if (!result.valid) {
        throw ValidationError.fromFieldErrors(result.errors);
    }
}
