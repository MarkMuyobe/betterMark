/**
 * ValidationSchema - V14 Schema definition types.
 *
 * Provides type-safe schema definitions for request validation.
 */

/**
 * Supported field types.
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/**
 * Field validation rule.
 */
export interface FieldRule {
    /** Field type */
    type: FieldType;
    /** Whether the field is required */
    required?: boolean;
    /** Minimum length for strings or minimum value for numbers */
    min?: number;
    /** Maximum length for strings or maximum value for numbers */
    max?: number;
    /** Regular expression pattern for strings */
    pattern?: RegExp;
    /** Allowed values (enum) */
    enum?: readonly (string | number | boolean)[];
    /** For array types: schema for array items */
    items?: FieldRule;
    /** For object types: nested schema */
    properties?: ValidationSchema;
    /** Whether to allow additional properties not in schema (for object type) */
    allowAdditional?: boolean;
    /** Custom error message */
    message?: string;
}

/**
 * Validation schema definition.
 */
export interface ValidationSchema {
    [field: string]: FieldRule;
}

/**
 * Schema options for validation.
 */
export interface SchemaOptions {
    /** Whether to reject unknown fields (default: true for mutations) */
    rejectUnknown?: boolean;
    /** Whether this is a mutation request (default: false) */
    isMutation?: boolean;
}

/**
 * Validation result.
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationFieldError[];
}

/**
 * Validation error for a specific field.
 */
export interface ValidationFieldError {
    field: string;
    message: string;
    value?: unknown;
}

/**
 * Create a string field rule.
 */
export function stringField(options: Partial<Omit<FieldRule, 'type'>> = {}): FieldRule {
    return { type: 'string', ...options };
}

/**
 * Create a number field rule.
 */
export function numberField(options: Partial<Omit<FieldRule, 'type'>> = {}): FieldRule {
    return { type: 'number', ...options };
}

/**
 * Create a boolean field rule.
 */
export function booleanField(options: Partial<Omit<FieldRule, 'type'>> = {}): FieldRule {
    return { type: 'boolean', ...options };
}

/**
 * Create an array field rule.
 */
export function arrayField(items: FieldRule, options: Partial<Omit<FieldRule, 'type' | 'items'>> = {}): FieldRule {
    return { type: 'array', items, ...options };
}

/**
 * Create an object field rule.
 */
export function objectField(properties: ValidationSchema, options: Partial<Omit<FieldRule, 'type' | 'properties'>> = {}): FieldRule {
    return { type: 'object', properties, ...options };
}
