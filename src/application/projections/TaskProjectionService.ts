/**
 * TaskProjectionService - V15 projection builder for tasks.
 *
 * Pure projection service with:
 * - No side effects
 * - No writes
 * - No domain mutation
 * - Idempotent operations
 */

import { IGoalRepository } from '../ports/IGoalRepository.js';
import { ISubGoalRepository } from '../ports/ISubGoalRepository.js';
import { ITaskRepository } from '../ports/ITaskRepository.js';
import { IScheduleRepository } from '../ports/IScheduleRepository.js';
import { TaskListReadModel, TaskListReadModelBuilder, TaskStatus } from '../read-models/TaskListReadModel.js';

/**
 * Filter options for task lists.
 */
export interface TaskFilterOptions {
    status?: TaskStatus;
    goalId?: string;
    subGoalId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    isScheduled?: boolean;
}

/**
 * Service for building task read models.
 */
export class TaskProjectionService {
    constructor(
        private readonly goalRepository: IGoalRepository,
        private readonly subGoalRepository: ISubGoalRepository,
        private readonly taskRepository: ITaskRepository,
        private readonly scheduleRepository: IScheduleRepository
    ) {}

    /**
     * Build all task list read models.
     */
    async buildAllTaskListReadModels(
        filters?: TaskFilterOptions
    ): Promise<TaskListReadModel[]> {
        const allTasks = await this.taskRepository.findAll();
        const allSubGoals = await this.subGoalRepository.findAll();
        const allGoals = await this.goalRepository.findAll();
        const allScheduleBlocks = await this.scheduleRepository.findAll();

        // Create lookup maps
        const subGoalMap = new Map(allSubGoals.map(sg => [sg.id, sg]));
        const goalMap = new Map(allGoals.map(g => [g.id, g]));

        // Map tasks to their schedule blocks
        const taskScheduleMap = new Map<string, typeof allScheduleBlocks[0]>();
        for (const block of allScheduleBlocks) {
            if (block.taskId) {
                taskScheduleMap.set(block.taskId, block);
            }
        }

        const readModels: TaskListReadModel[] = [];
        const now = new Date();

        for (const task of allTasks) {
            const subGoal = subGoalMap.get(task.subGoalId);
            if (!subGoal) continue;

            const goal = goalMap.get(subGoal.goalId);
            if (!goal) continue;

            // Determine task status
            let status: TaskStatus = 'pending';
            if (task.isCompleted) {
                status = 'completed';
            } else if (task.deadline && new Date(task.deadline) < now) {
                status = 'overdue';
            }

            // Apply filters
            if (filters?.status && status !== filters.status) {
                continue;
            }
            if (filters?.goalId && goal.id !== filters.goalId) {
                continue;
            }
            if (filters?.subGoalId && subGoal.id !== filters.subGoalId) {
                continue;
            }

            // Get schedule info
            const scheduleBlock = taskScheduleMap.get(task.id);
            const isScheduled = !!scheduleBlock;

            if (filters?.isScheduled !== undefined && isScheduled !== filters.isScheduled) {
                continue;
            }

            // Filter by schedule date if specified
            if (scheduleBlock && filters?.dateFrom) {
                const blockDate = new Date(scheduleBlock.timeRange.start);
                if (blockDate < filters.dateFrom) continue;
            }
            if (scheduleBlock && filters?.dateTo) {
                const blockDate = new Date(scheduleBlock.timeRange.start);
                if (blockDate > filters.dateTo) continue;
            }

            // Extract schedule times
            let scheduledDate: string | undefined;
            let scheduledStartTime: string | undefined;
            let scheduledEndTime: string | undefined;

            if (scheduleBlock) {
                const startDate = new Date(scheduleBlock.timeRange.start);
                const endDate = new Date(scheduleBlock.timeRange.end);
                scheduledDate = startDate.toISOString().split('T')[0];
                scheduledStartTime = startDate.toISOString();
                scheduledEndTime = endDate.toISOString();
            }

            readModels.push(
                TaskListReadModelBuilder.create()
                    .withId(task.id)
                    .withTitle(task.title)
                    .withDescription(task.description)
                    .withIsCompleted(task.isCompleted)
                    .withStatus(status)
                    .withDifficulty(task.difficulty)
                    .withEstimatedDurationMinutes(task.estimatedDurationMinutes)
                    .withDeadline(task.deadline)
                    .withSubGoalId(subGoal.id)
                    .withSubGoalTitle(subGoal.title)
                    .withGoalId(goal.id)
                    .withGoalTitle(goal.title)
                    .withGoalFacet(goal.facet)
                    .withIsScheduled(isScheduled)
                    .withScheduledDate(scheduledDate)
                    .withScheduledStartTime(scheduledStartTime)
                    .withScheduledEndTime(scheduledEndTime)
                    .build()
            );
        }

        // Sort: overdue first, then pending, then completed
        // Within each status, sort by deadline (earliest first)
        const statusOrder: Record<TaskStatus, number> = {
            overdue: 0,
            pending: 1,
            completed: 2,
        };

        readModels.sort((a, b) => {
            const statusDiff = statusOrder[a.status] - statusOrder[b.status];
            if (statusDiff !== 0) return statusDiff;

            // Sort by deadline if both have one
            if (a.deadline && b.deadline) {
                return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
            }
            // Tasks with deadlines first
            if (a.deadline) return -1;
            if (b.deadline) return 1;

            return 0;
        });

        return readModels;
    }

    /**
     * Build task read model by ID.
     */
    async buildTaskReadModel(taskId: string): Promise<TaskListReadModel | null> {
        const allModels = await this.buildAllTaskListReadModels();
        return allModels.find(t => t.id === taskId) ?? null;
    }

    /**
     * Build tasks for a specific goal.
     */
    async buildTasksForGoal(goalId: string): Promise<TaskListReadModel[]> {
        return this.buildAllTaskListReadModels({ goalId });
    }

    /**
     * Build pending tasks only.
     */
    async buildPendingTasks(): Promise<TaskListReadModel[]> {
        return this.buildAllTaskListReadModels({ status: 'pending' });
    }

    /**
     * Build overdue tasks.
     */
    async buildOverdueTasks(): Promise<TaskListReadModel[]> {
        return this.buildAllTaskListReadModels({ status: 'overdue' });
    }

    /**
     * Build tasks for today's schedule.
     */
    async buildTodaysTasks(): Promise<TaskListReadModel[]> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return this.buildAllTaskListReadModels({
            dateFrom: today,
            dateTo: tomorrow,
            isScheduled: true,
        });
    }
}
