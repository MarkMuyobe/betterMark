import { IActivityRepository } from '../../../application/ports/IActivityRepository.js';
import { IActivityLog } from '../../../domain/entities/ActivityLog.js';
import { IJournalEntry } from '../../../domain/entities/JournalEntry.js';

export class InMemoryActivityRepository implements IActivityRepository {
    private activities: Map<string, IActivityLog> = new Map();
    private journals: Map<string, IJournalEntry> = new Map();

    async saveActivity(activity: IActivityLog): Promise<void> {
        this.activities.set(activity.id, activity);
    }

    async saveJournal(journal: IJournalEntry): Promise<void> {
        this.journals.set(journal.id, journal);
    }

    async getRecentActivities(limit: number): Promise<IActivityLog[]> {
        return Array.from(this.activities.values())
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
    }
}
