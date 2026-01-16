import { ITaskRepository } from '../../ports/ITaskRepository.js';
import { ISubGoalRepository } from '../../ports/ISubGoalRepository.js';
import { IGoalRepository } from '../../ports/IGoalRepository.js';
import { IEventDispatcher } from '../../ports/IEventDispatcher.js';
import { ITask } from '../../../domain/entities/Task.js';
import { TaskCompleted } from '../../../domain/events/TaskCompleted.js';
import { GoalCompleted } from '../../../domain/events/GoalCompleted.js';

export class CompleteTask {
    constructor(
        private taskRepository: ITaskRepository,
        private subGoalRepository: ISubGoalRepository,
        private goalRepository: IGoalRepository,
        private eventDispatcher: IEventDispatcher
    ) { }

    async execute(taskId: string): Promise<ITask> {
        // 1. Find Task and update status
        const task = await this.taskRepository.findById(taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);

        if (task.isCompleted) return task;

        task.isCompleted = true;
        await this.taskRepository.save(task);

        // Emit Task Completed
        await this.eventDispatcher.dispatch(new TaskCompleted(task.id, task.subGoalId));

        // 2. Check Parent SubGoal
        const subGoal = await this.subGoalRepository.findById(task.subGoalId);
        if (subGoal) {
            const allTasksInSubGoal = await this.taskRepository.findAll();
            const siblings = allTasksInSubGoal.filter(t => t.subGoalId === subGoal.id);
            const allSiblingsComplete = siblings.every(t => t.isCompleted);

            if (allSiblingsComplete) {
                subGoal.isCompleted = true;
                await this.subGoalRepository.save(subGoal);

                // 3. Check Parent Goal
                const goal = await this.goalRepository.findById(subGoal.goalId);
                if (goal) {
                    const allSubGoalsInGoal = await this.subGoalRepository.findAll();
                    const goalSubGoals = allSubGoalsInGoal.filter(sg => sg.goalId === goal.id);
                    const allSubGoalsComplete = goalSubGoals.every(sg => sg.isCompleted);

                    if (allSubGoalsComplete) {
                        goal.isCompleted = true;
                        await this.goalRepository.save(goal);
                        // Emit Goal Completed
                        await this.eventDispatcher.dispatch(new GoalCompleted(goal.id));
                    }
                }
            }
        }

        return task;
    }
}
