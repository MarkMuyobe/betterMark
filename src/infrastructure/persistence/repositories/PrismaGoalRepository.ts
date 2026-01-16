import { IGoalRepository } from '../../../application/ports/IGoalRepository.js';
import { IGoal } from '../../../domain/entities/Goal.js';
import { prisma } from '../prisma/client.js';
import { GoalMapper } from '../mappers/GoalMapper.js';
import { Goal } from '../prisma/types.js'; // Import Manual Type

export class PrismaGoalRepository implements IGoalRepository {
    async save(goal: IGoal): Promise<void> {
        const data = GoalMapper.toPersistence(goal);

        // Upsert equivalent
        await prisma.goal.upsert({
            where: { id: data.id },
            update: {
                title: data.title,
                description: data.description,
                facet: data.facet,
                difficulty: data.difficulty,
                updatedAt: new Date()
            },
            create: {
                id: data.id,
                title: data.title,
                description: data.description,
                facet: data.facet,
                difficulty: data.difficulty,
                createdAt: new Date(), // Add required field
                updatedAt: new Date()  // Add required field
            }
        });
    }

    async findById(id: string): Promise<IGoal | null> {
        const record = await prisma.goal.findUnique({
            where: { id },
            include: {
                subGoals: {
                    include: { tasks: true }
                }
            }
        });

        return record ? GoalMapper.toDomain(record as unknown as Goal) : null;
    }

    async findAll(): Promise<IGoal[]> {
        const records = await prisma.goal.findMany({
            include: { subGoals: { include: { tasks: true } } }
        });
        return records.map((r: any) => GoalMapper.toDomain(r));
    }

    async findByFacet(facet: string): Promise<IGoal[]> {
        const records = await prisma.goal.findMany({
            where: { facet },
            include: { subGoals: { include: { tasks: true } } }
        });
        return records.map((r: any) => GoalMapper.toDomain(r));
    }

    async delete(id: string): Promise<void> {
        await prisma.goal.delete({ where: { id } });
    }
}
