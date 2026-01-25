/**
 * PreferenceSchemas - V14 Preference-related validation schemas.
 *
 * Schemas for preference rollback and related operations.
 */

import { ValidationSchema, stringField } from '../ValidationSchema.js';
import { agentTypeField, reasonField } from './CommonSchemas.js';

/**
 * Schema for preference rollback request body.
 * POST /admin/preferences/rollback
 */
export const PreferenceRollbackSchema: ValidationSchema = {
    agentType: agentTypeField,
    preferenceKey: stringField({
        required: true,
        min: 1,
        max: 200,
        message: 'Preference key is required',
    }),
    reason: reasonField,
};

/**
 * Schema for preference query parameters.
 * GET /admin/preferences
 */
export const PreferenceQuerySchema: ValidationSchema = {
    agent: stringField({
        required: false,
        pattern: /^[A-Za-z]+Agent$/,
    }),
    category: stringField({
        required: false,
        max: 50,
    }),
};
