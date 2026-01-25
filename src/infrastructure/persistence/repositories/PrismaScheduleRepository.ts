import { IScheduleRepository } from '../../../application/ports/IScheduleRepository.js';
import { IScheduleBlock } from '../../../domain/entities/ScheduleBlock.js';
import { TimeRange } from '../../../domain/value-objects/TimeRange.js';
import { prisma } from '../prisma/client.js';

export class PrismaScheduleRepository implements IScheduleRepository {
    async findAll(): Promise<IScheduleBlock[]> {
        const blocks = await prisma.scheduleBlock.findMany();
        return blocks.map((b: any) => ({
            id: b.id,
            timeRange: new TimeRange(b.startTime, b.endTime),
            label: b.label,
            isFixed: b.isFixed,
            taskId: b.taskId || undefined
        }));
    }

    async findById(id: string): Promise<IScheduleBlock | null> {
        const block = await prisma.scheduleBlock.findUnique({ where: { id } });
        if (!block) return null;
        return {
            id: block.id,
            timeRange: new TimeRange(block.startTime, block.endTime),
            label: block.label,
            isFixed: block.isFixed,
            taskId: block.taskId || undefined
        };
    }

    async getBlocksSafe(range: TimeRange): Promise<IScheduleBlock[]> {
        const blocks = await prisma.scheduleBlock.findMany({
            where: {
                startTime: { lt: range.end },
                endTime: { gt: range.start }
            }
        });

        return blocks.map((b: any) => ({
            id: b.id,
            timeRange: new TimeRange(b.startTime, b.endTime),
            label: b.label,
            isFixed: b.isFixed,
            taskId: b.taskId || undefined
        }));
    }

    async saveBlock(block: IScheduleBlock): Promise<void> {
        await prisma.scheduleBlock.upsert({
            where: { id: block.id },
            update: {
                startTime: block.timeRange.start,
                endTime: block.timeRange.end,
                label: block.label,
                isFixed: block.isFixed,
                updatedAt: new Date()
            },
            create: {
                id: block.id,
                startTime: block.timeRange.start,
                endTime: block.timeRange.end,
                label: block.label,
                isFixed: block.isFixed,
                taskId: block.taskId,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
    }

    async deleteBlock(id: string): Promise<void> {
        await prisma.scheduleBlock.delete({ where: { id } });
    }
}
