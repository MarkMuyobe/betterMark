/**
 * InMemoryJournalEntryRepository - V15 In-memory journal entry storage.
 */

import { IJournalEntry } from '../../../domain/entities/JournalEntry.js';
import { IJournalEntryRepository } from '../../../application/projections/ActivityProjectionService.js';

/**
 * In-memory implementation of journal entry repository.
 */
export class InMemoryJournalEntryRepository implements IJournalEntryRepository {
    private entries: Map<string, IJournalEntry> = new Map();

    async findAll(): Promise<IJournalEntry[]> {
        return Array.from(this.entries.values());
    }

    async findById(id: string): Promise<IJournalEntry | null> {
        return this.entries.get(id) ?? null;
    }

    async save(entry: IJournalEntry): Promise<void> {
        this.entries.set(entry.id, { ...entry });
    }

    async delete(id: string): Promise<void> {
        this.entries.delete(id);
    }

    /**
     * Find entry by date.
     */
    async findByDate(date: Date): Promise<IJournalEntry | null> {
        const dateStr = date.toISOString().split('T')[0];
        for (const entry of this.entries.values()) {
            const entryDateStr = entry.date.toISOString().split('T')[0];
            if (entryDateStr === dateStr) {
                return entry;
            }
        }
        return null;
    }

    /**
     * Find entries by tag.
     */
    async findByTag(tag: string): Promise<IJournalEntry[]> {
        return Array.from(this.entries.values()).filter(e =>
            e.tags.includes(tag)
        );
    }

    /**
     * Find entries in a date range.
     */
    async findByDateRange(from: Date, to: Date): Promise<IJournalEntry[]> {
        return Array.from(this.entries.values()).filter(e =>
            e.date >= from && e.date <= to
        );
    }

    /**
     * Clear all entries (for testing).
     */
    clear(): void {
        this.entries.clear();
    }
}
