/**
 * IConflictRepository - V11 port for storing and retrieving conflicts.
 */

import { IConflict } from '../../domain/entities/ArbitrationDecision.js';

export interface IConflictRepository {
    /**
     * Save a conflict.
     */
    save(conflict: IConflict): Promise<void>;

    /**
     * Find conflict by ID.
     */
    findById(id: string): Promise<IConflict | null>;

    /**
     * Find all unresolved conflicts.
     */
    findUnresolved(): Promise<IConflict[]>;

    /**
     * Find conflicts involving a proposal.
     */
    findByProposal(proposalId: string): Promise<IConflict[]>;

    /**
     * Find all conflicts.
     */
    findAll(): Promise<IConflict[]>;
}
