/**
 * ActivityLogReadModel - V15 Activity and journal entry read models.
 *
 * Contains activity log and journal entry information for activity views.
 */

/**
 * Activity log read model.
 */
export interface ActivityLogReadModel {
    id: string;
    type: 'task_completed' | 'goal_completed' | 'task_scheduled' | 'manual_log';
    description: string;
    timestamp: string;
    durationMinutes?: number;

    // Linked entities
    taskId?: string;
    taskTitle?: string;
    goalId?: string;
    goalTitle?: string;
}

/**
 * Journal entry read model.
 */
export interface JournalEntryReadModel {
    id: string;
    content: string;
    date: string;
    tags: string[];
    imageUrls?: string[];
    audioUrls?: string[];
    createdAt: string;
}

/**
 * Builder for ActivityLogReadModel.
 */
export class ActivityLogReadModelBuilder {
    private model: Partial<ActivityLogReadModel> = {};

    private constructor() {}

    static create(): ActivityLogReadModelBuilder {
        return new ActivityLogReadModelBuilder();
    }

    withId(id: string): this {
        this.model.id = id;
        return this;
    }

    withType(type: ActivityLogReadModel['type']): this {
        this.model.type = type;
        return this;
    }

    withDescription(description: string): this {
        this.model.description = description;
        return this;
    }

    withTimestamp(timestamp: Date): this {
        this.model.timestamp = timestamp.toISOString();
        return this;
    }

    withDurationMinutes(minutes?: number): this {
        this.model.durationMinutes = minutes;
        return this;
    }

    withTaskId(taskId?: string): this {
        this.model.taskId = taskId;
        return this;
    }

    withTaskTitle(taskTitle?: string): this {
        this.model.taskTitle = taskTitle;
        return this;
    }

    withGoalId(goalId?: string): this {
        this.model.goalId = goalId;
        return this;
    }

    withGoalTitle(goalTitle?: string): this {
        this.model.goalTitle = goalTitle;
        return this;
    }

    build(): ActivityLogReadModel {
        if (!this.model.id) throw new Error('id is required');
        if (!this.model.type) throw new Error('type is required');
        if (!this.model.description) throw new Error('description is required');
        if (!this.model.timestamp) throw new Error('timestamp is required');

        return {
            id: this.model.id,
            type: this.model.type,
            description: this.model.description,
            timestamp: this.model.timestamp,
            durationMinutes: this.model.durationMinutes,
            taskId: this.model.taskId,
            taskTitle: this.model.taskTitle,
            goalId: this.model.goalId,
            goalTitle: this.model.goalTitle,
        };
    }
}

/**
 * Builder for JournalEntryReadModel.
 */
export class JournalEntryReadModelBuilder {
    private model: Partial<JournalEntryReadModel> = {};

    private constructor() {}

    static create(): JournalEntryReadModelBuilder {
        return new JournalEntryReadModelBuilder();
    }

    withId(id: string): this {
        this.model.id = id;
        return this;
    }

    withContent(content: string): this {
        this.model.content = content;
        return this;
    }

    withDate(date: Date): this {
        this.model.date = date.toISOString().split('T')[0];
        return this;
    }

    withTags(tags: string[]): this {
        this.model.tags = tags;
        return this;
    }

    withImageUrls(urls?: string[]): this {
        this.model.imageUrls = urls;
        return this;
    }

    withAudioUrls(urls?: string[]): this {
        this.model.audioUrls = urls;
        return this;
    }

    withCreatedAt(createdAt: Date): this {
        this.model.createdAt = createdAt.toISOString();
        return this;
    }

    build(): JournalEntryReadModel {
        if (!this.model.id) throw new Error('id is required');
        if (!this.model.content) throw new Error('content is required');
        if (!this.model.date) throw new Error('date is required');
        if (!this.model.createdAt) throw new Error('createdAt is required');

        return {
            id: this.model.id,
            content: this.model.content,
            date: this.model.date,
            tags: this.model.tags ?? [],
            imageUrls: this.model.imageUrls,
            audioUrls: this.model.audioUrls,
            createdAt: this.model.createdAt,
        };
    }
}
