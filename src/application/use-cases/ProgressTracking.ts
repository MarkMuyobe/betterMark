import { IStreak } from '../../domain/entities/Streak.js';

export interface IProgressTrackingUseCase {
    /**
     * Updates streaks for all active habits/goals.
     */
    updateStreaks(): Promise<IStreak[]>;

    /**
     * Calculates specific trajectory grades based on recent performance.
     * @param goalId Specific goal to grade
     */
    calculateTrajectory(goalId: string): Promise<number>;
}
