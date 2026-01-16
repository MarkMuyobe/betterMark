import { describe, it, expect, beforeEach } from 'vitest';
import { CreateGoal } from '../implementation/CreateGoal.js';
import { InMemoryGoalRepository } from '../../../infrastructure/persistence/in-memory/InMemoryGoalRepository.js';
import { InMemoryEventDispatcher } from '../../../infrastructure/messaging/InMemoryEventDispatcher.js';
import { Facet } from '../../../domain/enums/Facet.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';
import { GoalCreated } from '../../../domain/events/GoalCreated.js';
import { IEventHandler } from '../../../application/ports/IEventDispatcher.js';

describe('CreateGoal Use Case', () => {
    let useCase: CreateGoal;
    let repository: InMemoryGoalRepository;
    let dispatcher: InMemoryEventDispatcher;

    beforeEach(() => {
        repository = new InMemoryGoalRepository();
        dispatcher = new InMemoryEventDispatcher();
        useCase = new CreateGoal(repository, dispatcher);
    });

    it('should create a goal and emit GoalCreated event', async () => {
        let eventEmitted = false;

        // Subscribe a test handler
        const testHandler: IEventHandler<GoalCreated> = {
            handle: async (event) => {
                eventEmitted = true;
                expect(event.goal.title).toBe('Learn TypeScript');
            }
        };
        dispatcher.subscribe('GoalCreated', testHandler);

        const request = {
            title: 'Learn TypeScript',
            description: 'Master the basics',
            facet: Facet.Career,
            difficulty: DifficultyProfile.Medium
        };

        const goal = await useCase.execute(request);

        expect(goal.id).toBeDefined();
        expect(eventEmitted).toBe(true);
    });

    it('should throw an error if title is empty (no event)', async () => {
        const request = { title: '', facet: Facet.Health, difficulty: DifficultyProfile.Easy };
        await expect(useCase.execute(request)).rejects.toThrow('Goal title is required');
    });
});
