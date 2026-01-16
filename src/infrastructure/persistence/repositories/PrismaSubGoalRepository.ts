import { ISubGoalRepository } from '../../../application/ports/ISubGoalRepository.js';
import { ISubGoal } from '../../../domain/entities/SubGoal.js';
import { prisma } from '../prisma/client.js';

export class PrismaSubGoalRepository implements ISubGoalRepository {
    async findById(id: string): Promise<ISubGoal | null> {
        const record = await prisma.subGoal.findUnique({
            where: { id },
            include: { tasks: true }
        });

        if (!record) return null;

        // Manual mapper for now as I don't recall seeing SubGoalMapper.ts
        // In V4, we should probably have dedicated mappers, but inline for speed/consistency with current pattern:
        return {
            id: record.id,
            title: record.title,
            description: record.description || undefined,
            isCompleted: record.isCompleted,
            goalId: record.goalId,
            taskIds: record.tasks ? record.tasks.map((t: any) => t.id) : []
        };
    }

    async save(subGoal: ISubGoal): Promise<void> {
        await prisma.subGoal.upsert({
            where: { id: subGoal.id },
            update: {
                title: subGoal.title,
                description: subGoal.description,
                isCompleted: subGoal.isCompleted,
                updatedAt: new Date()
            },
            create: {
                id: subGoal.id,
                title: subGoal.title,
                description: subGoal.description,
                isCompleted: subGoal.isCompleted,
                goalId: subGoal.goalId,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });
    }

    async findAll(): Promise<ISubGoal[]> {
        const records = await prisma.subGoal.findMany({ include: { tasks: true } });
        return records.map((r: any) => ({
            id: r.id,
            title: r.title,
            description: r.description || undefined,
            isCompleted: r.isCompleted,
            goalId: r.goalId,
            taskIds: r.tasks ? r.tasks.map((t: any) => t.id) : []
        }));
    }

    async delete(id: string): Promise<void> {
        await prisma.subGoal.delete({ where: { id } });
    }
}
