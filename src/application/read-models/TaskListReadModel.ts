/**
 * TaskListReadModel - V15 Task read model with goal context.
 *
 * Contains task information with parent goal/subgoal context for list views.
 */

import { DifficultyProfile } from '../../domain/enums/DifficultyProfile.js';
import { Facet } from '../../domain/enums/Facet.js';

/**
 * Task status for filtering.
 */
export type TaskStatus = 'pending' | 'completed' | 'overdue';

/**
 * Task read model with goal context.
 */
export interface TaskListReadModel {
    id: string;
    title: string;
    description?: string;
    isCompleted: boolean;
    status: TaskStatus;
    difficulty: DifficultyProfile;
    estimatedDurationMinutes?: number;
    deadline?: string;

    // Parent context
    subGoalId: string;
    subGoalTitle: string;
    goalId: string;
    goalTitle: string;
    goalFacet: Facet;

    // Schedule info
    isScheduled: boolean;
    scheduledDate?: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
}

/**
 * Builder for TaskListReadModel.
 */
export class TaskListReadModelBuilder {
    private model: Partial<TaskListReadModel> = {};

    private constructor() {}

    static create(): TaskListReadModelBuilder {
        return new TaskListReadModelBuilder();
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

    withIsCompleted(isCompleted: boolean): this {
        this.model.isCompleted = isCompleted;
        return this;
    }

    withStatus(status: TaskStatus): this {
        this.model.status = status;
        return this;
    }

    withDifficulty(difficulty: DifficultyProfile): this {
        this.model.difficulty = difficulty;
        return this;
    }

    withEstimatedDurationMinutes(minutes?: number): this {
        this.model.estimatedDurationMinutes = minutes;
        return this;
    }

    withDeadline(deadline?: Date): this {
        this.model.deadline = deadline?.toISOString();
        return this;
    }

    withSubGoalId(subGoalId: string): this {
        this.model.subGoalId = subGoalId;
        return this;
    }

    withSubGoalTitle(subGoalTitle: string): this {
        this.model.subGoalTitle = subGoalTitle;
        return this;
    }

    withGoalId(goalId: string): this {
        this.model.goalId = goalId;
        return this;
    }

    withGoalTitle(goalTitle: string): this {
        this.model.goalTitle = goalTitle;
        return this;
    }

    withGoalFacet(facet: Facet): this {
        this.model.goalFacet = facet;
        return this;
    }

    withIsScheduled(isScheduled: boolean): this {
        this.model.isScheduled = isScheduled;
        return this;
    }

    withScheduledDate(date?: string): this {
        this.model.scheduledDate = date;
        return this;
    }

    withScheduledStartTime(time?: string): this {
        this.model.scheduledStartTime = time;
        return this;
    }

    withScheduledEndTime(time?: string): this {
        this.model.scheduledEndTime = time;
        return this;
    }

    build(): TaskListReadModel {
        if (!this.model.id) throw new Error('id is required');
        if (!this.model.title) throw new Error('title is required');
        if (!this.model.difficulty) throw new Error('difficulty is required');
        if (!this.model.subGoalId) throw new Error('subGoalId is required');
        if (!this.model.subGoalTitle) throw new Error('subGoalTitle is required');
        if (!this.model.goalId) throw new Error('goalId is required');
        if (!this.model.goalTitle) throw new Error('goalTitle is required');
        if (!this.model.goalFacet) throw new Error('goalFacet is required');

        return {
            id: this.model.id,
            title: this.model.title,
            description: this.model.description,
            isCompleted: this.model.isCompleted ?? false,
            status: this.model.status ?? 'pending',
            difficulty: this.model.difficulty,
            estimatedDurationMinutes: this.model.estimatedDurationMinutes,
            deadline: this.model.deadline,
            subGoalId: this.model.subGoalId,
            subGoalTitle: this.model.subGoalTitle,
            goalId: this.model.goalId,
            goalTitle: this.model.goalTitle,
            goalFacet: this.model.goalFacet,
            isScheduled: this.model.isScheduled ?? false,
            scheduledDate: this.model.scheduledDate,
            scheduledStartTime: this.model.scheduledStartTime,
            scheduledEndTime: this.model.scheduledEndTime,
        };
    }
}
