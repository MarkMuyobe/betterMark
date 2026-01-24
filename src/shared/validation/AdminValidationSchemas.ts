/**
 * AdminValidationSchemas - V14 Validation schemas for admin mutation endpoints.
 *
 * Provides pre-defined schemas for admin API request validation.
 */

import { ValidationSchema, stringField } from './ValidationSchema.js';

/**
 * Schema for suggestion approval request.
 * POST /admin/suggestions/:id/approve
 */
export const SuggestionApproveSchema: ValidationSchema = {
    agentType: stringField({ required: true, min: 1, max: 100 }),
};

/**
 * Schema for suggestion rejection request.
 * POST /admin/suggestions/:id/reject
 */
export const SuggestionRejectSchema: ValidationSchema = {
    agentType: stringField({ required: true, min: 1, max: 100 }),
    reason: stringField({ required: true, min: 1, max: 500 }),
};

/**
 * Schema for preference rollback request.
 * POST /admin/preferences/rollback
 */
export const PreferenceRollbackSchema: ValidationSchema = {
    agentType: stringField({ required: true, min: 1, max: 100 }),
    preferenceKey: stringField({ required: true, min: 1, max: 200 }),
    reason: stringField({ required: true, min: 1, max: 500 }),
};

/**
 * Schema for escalation approval request.
 * POST /admin/escalations/:id/approve
 */
export const EscalationApproveSchema: ValidationSchema = {
    approvedBy: stringField({ required: false, max: 100 }),
    selectedProposalId: stringField({ required: false, max: 100 }),
};

/**
 * Schema for escalation rejection request.
 * POST /admin/escalations/:id/reject
 */
export const EscalationRejectSchema: ValidationSchema = {
    reason: stringField({ required: true, min: 1, max: 500 }),
    rejectedBy: stringField({ required: false, max: 100 }),
};

/**
 * Schema for arbitration rollback request.
 * POST /admin/arbitrations/:id/rollback
 */
export const ArbitrationRollbackSchema: ValidationSchema = {
    reason: stringField({ required: true, min: 1, max: 500 }),
};
