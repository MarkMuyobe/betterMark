import { ITaskRepository } from '../../../application/ports/ITaskRepository.js';
import { ITask } from '../../../domain/entities/Task.js';
import { prisma } from '../prisma/client.js';
import { TaskMapper } from '../mappers/TaskMapper.js';
import { Task } from '../prisma/types.js';

export class PrismaTaskRepository implements ITaskRepository {
    async findById(id: string): Promise<ITask | null> {
        const record = await prisma.task.findUnique({ where: { id } });
        return record ? TaskMapper.toDomain(record as unknown as Task) : null;
    }

    async save(task: ITask): Promise<void> {
        // Since we don't have a direct toPersistence for partial updates in this simple mapper,
        // we map manually for the Prisma create/update call to ensure we match the schema.

        await prisma.task.upsert({
            where: { id: task.id },
            update: {
                title: task.title,
                description: task.description,
                isCompleted: task.isCompleted,
                updatedAt: new Date()
                // Other fields would be mapped here
            },
            create: {
                id: task.id,
                title: task.title,
                description: task.description,
                isCompleted: task.isCompleted,
                difficulty: task.difficulty,
                subGoalId: task.subGoalId,
                createdAt: new Date(),
                updatedAt: new Date()
                // Other fields would be mapped here
            }
        });
    }

    async findAll(): Promise<ITask[]> {
        const records = await prisma.task.findMany({});
        return records.map((r: any) => TaskMapper.toDomain(r));
    }

    async delete(id: string): Promise<void> {
        await prisma.task.delete({ where: { id } });
    }
}
