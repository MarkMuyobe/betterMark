import { IGoalRepository } from '../../ports/IGoalRepository.js';
import { IGoal } from '../../../domain/entities/Goal.js';

export class UpdateGoal {
    constructor(private goalRepository: IGoalRepository) { }

    async execute(id: string, updates: Partial<IGoal>): Promise<IGoal> {
        // 1. Check if goal exists
        const existingGoal = await this.goalRepository.findById(id);
        if (!existingGoal) {
            throw new Error(`Goal with ID ${id} not found`);
        }

        // 2. Apply business rules / validation
        if (updates.title !== undefined && updates.title.trim().length === 0) {
            throw new Error("Goal title cannot be empty");
        }

        // Prevent updating ID or audit fields directly (createdAt should stay)
        const safeUpdates = { ...updates };
        delete (safeUpdates as any).id;
        delete (safeUpdates as any).createdAt;

        // 3. Merge updates
        const updatedGoal: IGoal = {
            ...existingGoal,
            ...safeUpdates,
            updatedAt: new Date()
        };

        // 4. Persist
        await this.goalRepository.save(updatedGoal);

        return updatedGoal;
    }
}
