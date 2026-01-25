/**
 * GoalDetailReadModel - V15 Full goal read model with nested subgoals/tasks.
 *
 * Contains complete goal information for detail views.
 */

import { Facet } from '../../domain/enums/Facet.js';
import { DifficultyProfile } from '../../domain/enums/DifficultyProfile.js';

/**
 * Task summary within a subgoal.
 */
export interface TaskSummary {
    id: string;
    title: string;
    description?: string;
    isCompleted: boolean;
    difficulty: DifficultyProfile;
    estimatedDurationMinutes?: number;
    deadline?: string;
}

/**
 * SubGoal with nested tasks.
 */
export interface SubGoalWithTasks {
    id: string;
    title: string;
    description?: string;
    isCompleted: boolean;
    tasks: TaskSummary[];
    progressPercent: number;
}

/**
 * Full goal detail read model.
 */
export interface GoalDetailReadModel {
    id: string;
    title: string;
    description?: string;
    facet: Facet;
    difficulty: DifficultyProfile;
    isCompleted: boolean;
    progressPercent: number;
    coachAgentId: string;
    subGoals: SubGoalWithTasks[];
    totalTaskCount: number;
    completedTaskCount: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Builder for GoalDetailReadModel.
 */
export class GoalDetailReadModelBuilder {
    private model: Partial<GoalDetailReadModel> = {};

    private constructor() {}

    static create(): GoalDetailReadModelBuilder {
        return new GoalDetailReadModelBuilder();
    }

    withId(id: string): this {
        this.model.id = id;
        return this;
    }

    withTitle(title: string): this {
        this.model.title = title;
        return this;
    }

    withDescription(description?: string): this {
        this.model.description = description;
        return this;
    }

    withFacet(facet: Facet): this {
        this.model.facet = facet;
        return this;
    }

    withDifficulty(difficulty: DifficultyProfile): this {
        this.model.difficulty = difficulty;
        return this;
    }

    withIsCompleted(isCompleted: boolean): this {
        this.model.isCompleted = isCompleted;
        return this;
    }

    withProgressPercent(progressPercent: number): this {
        this.model.progressPercent = progressPercent;
        return this;
    }

    withCoachAgentId(coachAgentId: string): this {
        this.model.coachAgentId = coachAgentId;
        return this;
    }

    withSubGoals(subGoals: SubGoalWithTasks[]): this {
        this.model.subGoals = subGoals;
        return this;
    }

    withTotalTaskCount(count: number): this {
        this.model.totalTaskCount = count;
        return this;
    }

    withCompletedTaskCount(count: number): this {
        this.model.completedTaskCount = count;
        return this;
    }

    withCreatedAt(createdAt: Date): this {
        this.model.createdAt = createdAt.toISOString();
        return this;
    }

    withUpdatedAt(updatedAt: Date): this {
        this.model.updatedAt = updatedAt.toISOString();
        return this;
    }

    build(): GoalDetailReadModel {
        if (!this.model.id) throw new Error('id is required');
        if (!this.model.title) throw new Error('title is required');
        if (!this.model.facet) throw new Error('facet is required');
        if (!this.model.difficulty) throw new Error('difficulty is required');
        if (!this.model.createdAt) throw new Error('createdAt is required');
        if (!this.model.updatedAt) throw new Error('updatedAt is required');

        return {
            id: this.model.id,
            title: this.model.title,
            description: this.model.description,
            facet: this.model.facet,
            difficulty: this.model.difficulty,
            isCompleted: this.model.isCompleted ?? false,
            progressPercent: this.model.progressPercent ?? 0,
            coachAgentId: this.model.coachAgentId ?? 'default-coach',
            subGoals: this.model.subGoals ?? [],
            totalTaskCount: this.model.totalTaskCount ?? 0,
            completedTaskCount: this.model.completedTaskCount ?? 0,
            createdAt: this.model.createdAt,
            updatedAt: this.model.updatedAt,
        };
    }
}
