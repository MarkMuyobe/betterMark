import { DifficultyProfile } from '../enums/DifficultyProfile.js';

export interface ITask {
    id: string;
    title: string;
    description?: string;
    isCompleted: boolean;

    // Context-bound properties
    location?: string;
    requiredEnergyLevel?: number; // 1-10
    requiredTools?: string[];

    // Time-bound properties
    estimatedDurationMinutes?: number;
    deadline?: Date;

    difficulty: DifficultyProfile;
    subGoalId: string;
}
