/**
 * IArbitrationDecisionRepository - V11 port for storing and retrieving arbitration decisions.
 */

import { IArbitrationDecision, ArbitrationOutcome } from '../../domain/entities/ArbitrationDecision.js';

export interface IArbitrationDecisionRepository {
    /**
     * Save a decision.
     */
    save(decision: IArbitrationDecision): Promise<void>;

    /**
     * Find decision by ID.
     */
    findById(id: string): Promise<IArbitrationDecision | null>;

    /**
     * Find decision for a conflict.
     */
    findByConflictId(conflictId: string): Promise<IArbitrationDecision | null>;

    /**
     * Find decisions by outcome.
     */
    findByOutcome(outcome: ArbitrationOutcome): Promise<IArbitrationDecision[]>;

    /**
     * Find decisions pending human approval.
     */
    findPendingApproval(): Promise<IArbitrationDecision[]>;

    /**
     * Find all decisions.
     */
    findAll(): Promise<IArbitrationDecision[]>;

    /**
     * Mark decision as executed.
     */
    markExecuted(id: string): Promise<void>;
}
