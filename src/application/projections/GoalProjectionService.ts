/**
 * GoalProjectionService - V15 projection builder for goals.
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
import { GoalListReadModel, GoalListReadModelBuilder } from '../read-models/GoalListReadModel.js';
import {
    GoalDetailReadModel,
    GoalDetailReadModelBuilder,
    SubGoalWithTasks,
    TaskSummary,
} from '../read-models/GoalDetailReadModel.js';
import { Facet } from '../../domain/enums/Facet.js';

/**
 * Filter options for goal lists.
 */
export interface GoalFilterOptions {
    facet?: Facet;
    status?: 'active' | 'completed' | 'all';
}

/**
 * Service for building goal read models.
 */
export class GoalProjectionService {
    constructor(
        private readonly goalRepository: IGoalRepository,
        private readonly subGoalRepository: ISubGoalRepository,
        private readonly taskRepository: ITaskRepository
    ) {}

    /**
     * Build all goal list read models.
     */
    async buildAllGoalListReadModels(
        filters?: GoalFilterOptions
    ): Promise<GoalListReadModel[]> {
        const goals = await this.goalRepository.findAll();
        const allSubGoals = await this.subGoalRepository.findAll();
        const allTasks = await this.taskRepository.findAll();

        const readModels: GoalListReadModel[] = [];

        for (const goal of goals) {
            // Apply filters
            if (filters?.facet && goal.facet !== filters.facet) {
                continue;
            }
            if (filters?.status === 'active' && goal.isCompleted) {
                continue;
            }
            if (filters?.status === 'completed' && !goal.isCompleted) {
                continue;
            }

            // Get subgoals for this goal
            const goalSubGoals = allSubGoals.filter(sg => sg.goalId === goal.id);

            // Get tasks for all subgoals
            const subGoalIds = new Set(goalSubGoals.map(sg => sg.id));
            const goalTasks = allTasks.filter(t => subGoalIds.has(t.subGoalId));

            // Calculate progress
            const taskCount = goalTasks.length;
            const completedTaskCount = goalTasks.filter(t => t.isCompleted).length;
            const progressPercent = taskCount > 0
                ? Math.round((completedTaskCount / taskCount) * 100)
                : 0;

            readModels.push(
                GoalListReadModelBuilder.create()
                    .withId(goal.id)
                    .withTitle(goal.title)
                    .withDescription(goal.description)
                    .withFacet(goal.facet)
                    .withDifficulty(goal.difficulty)
                    .withIsCompleted(goal.isCompleted)
                    .withProgressPercent(progressPercent)
                    .withSubGoalCount(goalSubGoals.length)
                    .withTaskCount(taskCount)
                    .withCompletedTaskCount(completedTaskCount)
                    .withCreatedAt(goal.createdAt)
                    .withUpdatedAt(goal.updatedAt)
                    .build()
            );
        }

        // Sort by updatedAt descending (most recent first)
        readModels.sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        return readModels;
    }

    /**
     * Build a single goal detail read model.
     */
    async buildGoalDetailReadModel(goalId: string): Promise<GoalDetailReadModel | null> {
        const goal = await this.goalRepository.findById(goalId);
        if (!goal) return null;

        const allSubGoals = await this.subGoalRepository.findAll();
        const allTasks = await this.taskRepository.findAll();

        // Get subgoals for this goal
        const goalSubGoals = allSubGoals.filter(sg => sg.goalId === goal.id);

        // Build subgoals with tasks
        const subGoalsWithTasks: SubGoalWithTasks[] = [];
        let totalTaskCount = 0;
        let totalCompletedTaskCount = 0;

        for (const subGoal of goalSubGoals) {
            // Get tasks for this subgoal
            const subGoalTasks = allTasks.filter(t => t.subGoalId === subGoal.id);

            // Build task summaries
            const taskSummaries: TaskSummary[] = subGoalTasks.map(task => ({
                id: task.id,
                title: task.title,
                description: task.description,
                isCompleted: task.isCompleted,
                difficulty: task.difficulty,
                estimatedDurationMinutes: task.estimatedDurationMinutes,
                deadline: task.deadline?.toISOString(),
            }));

            // Calculate subgoal progress
            const completedTasks = subGoalTasks.filter(t => t.isCompleted).length;
            const subGoalProgress = subGoalTasks.length > 0
                ? Math.round((completedTasks / subGoalTasks.length) * 100)
                : 0;

            subGoalsWithTasks.push({
                id: subGoal.id,
                title: subGoal.title,
                description: subGoal.description,
                isCompleted: subGoal.isCompleted,
                tasks: taskSummaries,
                progressPercent: subGoalProgress,
            });

            totalTaskCount += subGoalTasks.length;
            totalCompletedTaskCount += completedTasks;
        }

        // Calculate overall progress
        const progressPercent = totalTaskCount > 0
            ? Math.round((totalCompletedTaskCount / totalTaskCount) * 100)
            : 0;

        return GoalDetailReadModelBuilder.create()
            .withId(goal.id)
            .withTitle(goal.title)
            .withDescription(goal.description)
            .withFacet(goal.facet)
            .withDifficulty(goal.difficulty)
            .withIsCompleted(goal.isCompleted)
            .withProgressPercent(progressPercent)
            .withCoachAgentId(goal.coachAgentId)
            .withSubGoals(subGoalsWithTasks)
            .withTotalTaskCount(totalTaskCount)
            .withCompletedTaskCount(totalCompletedTaskCount)
            .withCreatedAt(goal.createdAt)
            .withUpdatedAt(goal.updatedAt)
            .build();
    }

    /**
     * Build goal list read models filtered by facet.
     */
    async buildGoalsByFacet(facet: Facet): Promise<GoalListReadModel[]> {
        return this.buildAllGoalListReadModels({ facet });
    }

    /**
     * Build active (not completed) goal list read models.
     */
    async buildActiveGoals(): Promise<GoalListReadModel[]> {
        return this.buildAllGoalListReadModels({ status: 'active' });
    }

    /**
     * Build completed goal list read models.
     */
    async buildCompletedGoals(): Promise<GoalListReadModel[]> {
        return this.buildAllGoalListReadModels({ status: 'completed' });
    }
}
