import { IGoal } from '../entities/Goal.js';
import { IScheduleBlock } from '../entities/ScheduleBlock.js';

export interface ISuperAgentBehavior {
    /**
     * Resolves conflicts between competing goals or schedule blocks.
     * @param conflicts List of conflicting items.
     * @returns A resolution strategy or updated schedule.
     */
    resolveConflicts(conflicts: any[]): Promise<void>;

    /**
     * Reprioritizes goals based on user input or global constraints.
     * @param goals List of active goals.
     * @returns Reordered list of goals.
     */
    reprioritize(goals: IGoal[]): Promise<IGoal[]>;

    /**
     * Generates a global schedule across all facets.
     * @param goals Active goals to schedule.
     * @returns A list of schedule blocks.
     */
    schedule(goals: IGoal[]): Promise<IScheduleBlock[]>;
}
