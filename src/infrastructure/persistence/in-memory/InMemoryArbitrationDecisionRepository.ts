/**
 * InMemoryArbitrationDecisionRepository - V11 in-memory implementation.
 */

import { IArbitrationDecisionRepository } from '../../../application/ports/IArbitrationDecisionRepository.js';
import { IArbitrationDecision, ArbitrationOutcome } from '../../../domain/entities/ArbitrationDecision.js';

export class InMemoryArbitrationDecisionRepository implements IArbitrationDecisionRepository {
    private decisions: Map<string, IArbitrationDecision> = new Map();

    async save(decision: IArbitrationDecision): Promise<void> {
        this.decisions.set(decision.id, { ...decision });
    }

    async findById(id: string): Promise<IArbitrationDecision | null> {
        const decision = this.decisions.get(id);
        return decision ? { ...decision } : null;
    }

    async findByConflictId(conflictId: string): Promise<IArbitrationDecision | null> {
        const decision = Array.from(this.decisions.values()).find(
            (d) => d.conflictId === conflictId
        );
        return decision ? { ...decision } : null;
    }

    async findByOutcome(outcome: ArbitrationOutcome): Promise<IArbitrationDecision[]> {
        return Array.from(this.decisions.values())
            .filter((d) => d.outcome === outcome)
            .map((d) => ({ ...d }));
    }

    async findPendingApproval(): Promise<IArbitrationDecision[]> {
        return Array.from(this.decisions.values())
            .filter((d) => d.requiresHumanApproval && !d.executed)
            .map((d) => ({ ...d }));
    }

    async findAll(): Promise<IArbitrationDecision[]> {
        return Array.from(this.decisions.values()).map((d) => ({ ...d }));
    }

    async markExecuted(id: string): Promise<void> {
        const decision = this.decisions.get(id);
        if (decision) {
            decision.executed = true;
            decision.executedAt = new Date();
        }
    }

    // Test helper
    clear(): void {
        this.decisions.clear();
    }
}
