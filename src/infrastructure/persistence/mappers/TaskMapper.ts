import { Task } from '../prisma/types.js'; // Changed import
import { ITask } from '../../../domain/entities/Task.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';

export class TaskMapper {
    static toDomain(raw: Task): ITask {
        return {
            id: raw.id,
            title: raw.title,
            description: raw.description || undefined,
            isCompleted: raw.isCompleted,
            location: raw.location || undefined,
            requiredEnergyLevel: raw.requiredEnergy || undefined,
            requiredTools: raw.requiredTools ? raw.requiredTools.split(',') : undefined,
            estimatedDurationMinutes: raw.estimatedMinutes || undefined,
            deadline: raw.deadline || undefined,
            difficulty: raw.difficulty as unknown as DifficultyProfile,
            subGoalId: raw.subGoalId
        };
    }
}
