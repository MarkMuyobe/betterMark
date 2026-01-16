import { Facet } from '../enums/Facet.js';
import { DifficultyProfile } from '../enums/DifficultyProfile.js';
import { ICoachAgentBehavior } from '../interfaces/ICoachAgentBehavior.js';

export interface IGoal {
    id: string;
    title: string;
    description?: string;
    facet: Facet;
    difficulty: DifficultyProfile;
    coachAgentId: string; // One CoachAgent per Goal
    subGoalIds: string[]; // Shared SubGoals
    createdAt: Date;
    updatedAt: Date;
    isCompleted: boolean;
}
