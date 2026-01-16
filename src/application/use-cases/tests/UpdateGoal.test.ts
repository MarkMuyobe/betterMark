import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateGoal } from '../implementation/UpdateGoal.js';
import { InMemoryGoalRepository } from '../../../infrastructure/persistence/in-memory/InMemoryGoalRepository.js';
import { Facet } from '../../../domain/enums/Facet.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';
import { IGoal } from '../../../domain/entities/Goal.js';

describe('UpdateGoal Use Case', () => {
    let useCase: UpdateGoal;
    let repository: InMemoryGoalRepository;
    let existingGoal: IGoal;

    beforeEach(async () => {
        repository = new InMemoryGoalRepository();
        useCase = new UpdateGoal(repository);

        // Seed
        existingGoal = {
            id: 'goal-1',
            title: 'Old Title',
            facet: Facet.Career,
            difficulty: DifficultyProfile.Medium,
            createdAt: new Date(),
            updatedAt: new Date(),
            coachAgentId: 'agent-1',
            subGoalIds: [],
            isCompleted: false
        };
        await repository.save(existingGoal);
    });

    it('should update the goal title', async () => {
        const updated = await useCase.execute('goal-1', { title: 'New Title' });

        expect(updated.title).toBe('New Title');
        expect(updated.updatedAt.getTime()).toBeGreaterThan(existingGoal.updatedAt.getTime());

        const inRepo = await repository.findById('goal-1');
        expect(inRepo?.title).toBe('New Title');
    });

    it('should throw error if goal not found', async () => {
        await expect(useCase.execute('non-existent', { title: 'Val' }))
            .rejects.toThrow('not found');
    });

    it('should throw error if title is empty string', async () => {
        await expect(useCase.execute('goal-1', { title: '   ' }))
            .rejects.toThrow('Goal title cannot be empty');
    });
});
