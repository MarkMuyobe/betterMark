import { IActivityLog } from '../../domain/entities/ActivityLog.js';
import { IJournalEntry } from '../../domain/entities/JournalEntry.js';

export interface ILogActivityUseCase {
    /**
     * Logs a daily activity or task completion.
     * @param activity The activity details
     */
    logActivity(activity: IActivityLog): Promise<void>;

    /**
     * Records a journal entry.
     * @param entry Journal entry to save
     */
    logJournal(entry: IJournalEntry): Promise<void>;
}
