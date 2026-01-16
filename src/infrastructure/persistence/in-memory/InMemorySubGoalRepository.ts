import { ISubGoalRepository } from '../../../application/ports/ISubGoalRepository.js';
import { ISubGoal } from '../../../domain/entities/SubGoal.js';

export class InMemorySubGoalRepository implements ISubGoalRepository {
    private subGoals: Map<string, ISubGoal> = new Map();

    async findById(id: string): Promise<ISubGoal | null> {
        return this.subGoals.get(id) || null;
    }

    async save(subGoal: ISubGoal): Promise<void> {
        this.subGoals.set(subGoal.id, subGoal);
    }

    async findAll(): Promise<ISubGoal[]> {
        return Array.from(this.subGoals.values());
    }

    async delete(id: string): Promise<void> {
        this.subGoals.delete(id);
    }
}
