import { IActivityRepository } from '../../../application/ports/IActivityRepository.js';
import { IActivityLog } from '../../../domain/entities/ActivityLog.js';
import { IJournalEntry } from '../../../domain/entities/JournalEntry.js';
import { prisma } from '../prisma/client.js';
import { ActivityLog } from '../prisma/types.js';

export class PrismaActivityRepository implements IActivityRepository {
    async saveActivity(activity: IActivityLog): Promise<void> {
        await prisma.activityLog.upsert({
            where: { id: activity.id },
            update: {
                timestamp: activity.timestamp,
                description: activity.description,
                durationMinutes: activity.durationMinutes,
                taskId: activity.taskId,
                goalId: activity.goalId
            },
            create: {
                id: activity.id,
                timestamp: activity.timestamp,
                description: activity.description,
                durationMinutes: activity.durationMinutes,
                taskId: activity.taskId,
                goalId: activity.goalId
            }
        });
    }

    async saveJournal(journal: IJournalEntry): Promise<void> {
        await prisma.journalEntry.upsert({
            where: { id: journal.id },
            update: {
                date: journal.date,
                content: journal.content,
                tags: journal.tags,
                imageUrls: journal.imageUrls || [],
                audioUrls: journal.audioUrls || []
            },
            create: {
                id: journal.id,
                date: journal.date,
                content: journal.content,
                tags: journal.tags,
                imageUrls: journal.imageUrls || [],
                audioUrls: journal.audioUrls || [],
                createdAt: new Date()
            }
        });
    }

    async getRecentActivities(limit: number): Promise<IActivityLog[]> {
        const records = await prisma.activityLog.findMany({
            orderBy: { timestamp: 'desc' },
            take: limit
        });

        return records.map((r: ActivityLog) => ({
            id: r.id,
            timestamp: r.timestamp,
            description: r.description,
            durationMinutes: r.durationMinutes,
            taskId: r.taskId || undefined,
            goalId: r.goalId || undefined
        }));
    }
}
