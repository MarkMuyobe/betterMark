import { IGoal } from '../entities/Goal.js';
import { ITask } from '../entities/Task.js';
import { IRecommendation } from '../../shared/types/Common.js'; // Will define this later

export interface ICoachAgentBehavior {
    /**
     * Generates a plan for the goal based on its difficulty profile and constraints.
     * @param goal The goal to plan for.
     * @returns A list of suggested sub-goals or tasks.
     */
    generatePlan(goal: IGoal): Promise<ITask[]>;

    /**
     * Adjusts the current plan based on progress and feedback.
     * @param goal The goal to adjust.
     * @param progress The current progress metrics.
     */
    adjustPlan(goal: IGoal, progress: any): Promise<void>;

    /**
     * Scores the user's performance on the goal.
     * @param goal The goal to score.
     * @returns A score between 0 and 100.
     */
    scorePerformance(goal: IGoal): Promise<number>;

    /**
     * Provides feedback to the user based on recent activity.
     * @param goal The goal context.
     * @returns Feedback text or structured recommendation.
     */
    provideFeedback(goal: IGoal): Promise<string>;
}
