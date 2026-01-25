/**
 * CommonSchemas - V14 Common validation schemas.
 *
 * Provides reusable field definitions and patterns.
 */

import { ValidationSchema, stringField, numberField } from '../ValidationSchema.js';

/**
 * UUID v4 pattern.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Simple ID pattern (alphanumeric with dashes).
 */
export const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Date ISO 8601 pattern.
 */
export const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;

/**
 * ID field (required, alphanumeric).
 */
export const idField = stringField({
    required: true,
    min: 1,
    max: 100,
    pattern: ID_PATTERN,
    message: 'ID must be alphanumeric with dashes or underscores',
});

/**
 * Optional ID field.
 */
export const optionalIdField = stringField({
    required: false,
    min: 1,
    max: 100,
    pattern: ID_PATTERN,
});

/**
 * UUID field.
 */
export const uuidField = stringField({
    required: true,
    pattern: UUID_PATTERN,
    message: 'Must be a valid UUID',
});

/**
 * Optional UUID field.
 */
export const optionalUuidField = stringField({
    required: false,
    pattern: UUID_PATTERN,
});

/**
 * Reason field (required, non-empty string).
 */
export const reasonField = stringField({
    required: true,
    min: 1,
    max: 500,
    message: 'Reason is required and must be at most 500 characters',
});

/**
 * Optional reason field.
 */
export const optionalReasonField = stringField({
    required: false,
    max: 500,
});

/**
 * Agent type field.
 */
export const agentTypeField = stringField({
    required: true,
    min: 1,
    max: 50,
    pattern: /^[A-Za-z]+Agent$/,
    message: 'Agent type must end with "Agent"',
});

/**
 * Optional agent type field.
 */
export const optionalAgentTypeField = stringField({
    required: false,
    pattern: /^[A-Za-z]+Agent$/,
});

/**
 * Pagination query schema.
 */
export const PaginationQuerySchema: ValidationSchema = {
    page: numberField({ required: false, min: 1 }),
    pageSize: numberField({ required: false, min: 1, max: 100 }),
};

/**
 * Date range query schema.
 */
export const DateRangeQuerySchema: ValidationSchema = {
    since: stringField({ required: false, pattern: DATE_ISO_PATTERN }),
    until: stringField({ required: false, pattern: DATE_ISO_PATTERN }),
};
