/**
 * GoalListReadModel - V15 Goal summary read model for list views.
 *
 * Contains goal information with progress calculation for list displays.
 */

import { Facet } from '../../domain/enums/Facet.js';
import { DifficultyProfile } from '../../domain/enums/DifficultyProfile.js';

/**
 * Goal summary for list views.
 */
export interface GoalListReadModel {
    id: string;
    title: string;
    description?: string;
    facet: Facet;
    difficulty: DifficultyProfile;
    isCompleted: boolean;
    progressPercent: number;
    subGoalCount: number;
    taskCount: number;
    completedTaskCount: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Builder for GoalListReadModel.
 */
export class GoalListReadModelBuilder {
    private model: Partial<GoalListReadModel> = {};

    private constructor() {}

    static create(): GoalListReadModelBuilder {
        return new GoalListReadModelBuilder();
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

    withSubGoalCount(count: number): this {
        this.model.subGoalCount = count;
        return this;
    }

    withTaskCount(taskCount: number): this {
        this.model.taskCount = taskCount;
        return this;
    }

    withCompletedTaskCount(completedTaskCount: number): this {
        this.model.completedTaskCount = completedTaskCount;
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

    build(): GoalListReadModel {
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
            subGoalCount: this.model.subGoalCount ?? 0,
            taskCount: this.model.taskCount ?? 0,
            completedTaskCount: this.model.completedTaskCount ?? 0,
            createdAt: this.model.createdAt,
            updatedAt: this.model.updatedAt,
        };
    }
}
