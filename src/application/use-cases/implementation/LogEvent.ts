import { IActivityRepository } from '../../ports/IActivityRepository.js';
import { IActivityLog } from '../../../domain/entities/ActivityLog.js';
import { IJournalEntry } from '../../../domain/entities/JournalEntry.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

export class LogEvent {
    constructor(private activityRepository: IActivityRepository) { }

    async logActivity(
        description: string,
        durationMinutes: number,
        taskId?: string,
        goalId?: string
    ): Promise<IActivityLog> {
        if (durationMinutes <= 0) {
            throw new Error("Duration must be positive");
        }

        const activity: IActivityLog = {
            id: IdGenerator.generate(),
            timestamp: new Date(),
            description,
            durationMinutes,
            taskId,
            goalId
        };

        await this.activityRepository.saveActivity(activity);
        return activity;
    }

    async logJournal(
        content: string,
        tags: string[] = [],
        imageUrls: string[] = [],
        audioUrls: string[] = []
    ): Promise<IJournalEntry> {
        if (content.trim().length === 0) {
            throw new Error("Journal content cannot be empty");
        }

        const journal: IJournalEntry = {
            id: IdGenerator.generate(),
            date: new Date(),
            content,
            tags,
            imageUrls,
            audioUrls,
            createdAt: new Date()
        };

        await this.activityRepository.saveJournal(journal);
        return journal;
    }
}
