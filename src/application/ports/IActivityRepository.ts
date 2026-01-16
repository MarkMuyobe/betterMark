import { IActivityLog } from '../../domain/entities/ActivityLog.js';
import { IJournalEntry } from '../../domain/entities/JournalEntry.js';

export interface IActivityRepository {
    saveActivity(activity: IActivityLog): Promise<void>;
    saveJournal(journal: IJournalEntry): Promise<void>;
    getRecentActivities(limit: number): Promise<IActivityLog[]>;
}
