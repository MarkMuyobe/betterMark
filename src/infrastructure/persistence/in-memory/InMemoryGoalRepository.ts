import { IGoalRepository } from '../../../application/ports/IGoalRepository.js';
import { IGoal } from '../../../domain/entities/Goal.js';

export class InMemoryGoalRepository implements IGoalRepository {
    private goals: Map<string, IGoal> = new Map();

    async findById(id: string): Promise<IGoal | null> {
        return this.goals.get(id) || null;
    }

    async save(goal: IGoal): Promise<void> {
        this.goals.set(goal.id, goal);
    }

    async findAll(): Promise<IGoal[]> {
        return Array.from(this.goals.values());
    }

    async findByFacet(facet: string): Promise<IGoal[]> {
        return Array.from(this.goals.values()).filter(g => g.facet === facet);
    }

    async delete(id: string): Promise<void> {
        this.goals.delete(id);
    }
}
