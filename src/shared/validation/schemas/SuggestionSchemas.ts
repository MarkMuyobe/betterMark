/**
 * SuggestionSchemas - V14 Suggestion-related validation schemas.
 *
 * Schemas for suggestion approval and rejection operations.
 */

import { ValidationSchema, stringField } from '../ValidationSchema.js';
import { agentTypeField, reasonField, optionalIdField } from './CommonSchemas.js';

/**
 * Schema for suggestion approval request body.
 * POST /admin/suggestions/:id/approve
 */
export const SuggestionApproveSchema: ValidationSchema = {
    agentType: agentTypeField,
};

/**
 * Schema for suggestion rejection request body.
 * POST /admin/suggestions/:id/reject
 */
export const SuggestionRejectSchema: ValidationSchema = {
    agentType: agentTypeField,
    reason: reasonField,
};

/**
 * Schema for escalation approval request body.
 * POST /admin/escalations/:id/approve
 */
export const EscalationApproveSchema: ValidationSchema = {
    approvedBy: stringField({
        required: false,
        max: 100,
    }),
    selectedProposalId: optionalIdField,
};

/**
 * Schema for escalation rejection request body.
 * POST /admin/escalations/:id/reject
 */
export const EscalationRejectSchema: ValidationSchema = {
    reason: reasonField,
    rejectedBy: stringField({
        required: false,
        max: 100,
    }),
};

/**
 * Schema for arbitration rollback request body.
 * POST /admin/arbitrations/:id/rollback
 */
export const ArbitrationRollbackSchema: ValidationSchema = {
    reason: reasonField,
};

/**
 * Schema for suggestion query parameters.
 * GET /admin/suggestions
 */
export const SuggestionQuerySchema: ValidationSchema = {
    status: stringField({
        required: false,
        enum: ['pending', 'approved', 'rejected', 'applied'],
    }),
    agent: stringField({
        required: false,
        pattern: /^[A-Za-z]+Agent$/,
    }),
};

/**
 * Schema for arbitration query parameters.
 * GET /admin/arbitrations
 */
export const ArbitrationQuerySchema: ValidationSchema = {
    escalated: stringField({
        required: false,
        enum: ['true', 'false'],
    }),
};
