/**
 * InMemoryConflictRepository - V11 in-memory implementation.
 */

import { IConflictRepository } from '../../../application/ports/IConflictRepository.js';
import { IConflict } from '../../../domain/entities/ArbitrationDecision.js';

export class InMemoryConflictRepository implements IConflictRepository {
    private conflicts: Map<string, IConflict> = new Map();
    private resolvedConflictIds: Set<string> = new Set();

    async save(conflict: IConflict): Promise<void> {
        this.conflicts.set(conflict.id, { ...conflict });
    }

    async findById(id: string): Promise<IConflict | null> {
        const conflict = this.conflicts.get(id);
        return conflict ? { ...conflict } : null;
    }

    async findUnresolved(): Promise<IConflict[]> {
        return Array.from(this.conflicts.values())
            .filter((c) => !this.resolvedConflictIds.has(c.id))
            .map((c) => ({ ...c }));
    }

    async findByProposal(proposalId: string): Promise<IConflict[]> {
        return Array.from(this.conflicts.values())
            .filter((c) => c.proposalIds.includes(proposalId))
            .map((c) => ({ ...c }));
    }

    async findAll(): Promise<IConflict[]> {
        return Array.from(this.conflicts.values()).map((c) => ({ ...c }));
    }

    markResolved(conflictId: string): void {
        this.resolvedConflictIds.add(conflictId);
    }

    // Test helper
    clear(): void {
        this.conflicts.clear();
        this.resolvedConflictIds.clear();
    }
}
