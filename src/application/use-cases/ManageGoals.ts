import { IGoal } from '../../domain/entities/Goal.js';
import { ITask } from '../../domain/entities/Task.js';

export interface IManageGoalsUseCase {
    /**
     * Creates a new goal and assigns a default coach.
     * @param request Data to create a goal
     */
    createGoal(request: Partial<IGoal>): Promise<IGoal>;

    /**
     * Updates an existing goal.
     * @param id Goal ID
     * @param updates Updates to apply
     */
    updateGoal(id: string, updates: Partial<IGoal>): Promise<IGoal>;

    /**
     * Breaks a goal down into specific actionable tasks.
     * @param goalId Goal to break down
     * @returns List of generated tasks
     */
    breakDownGoal(goalId: string): Promise<ITask[]>;
}
