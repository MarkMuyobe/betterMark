export interface ISubGoal {
    id: string;
    title: string;
    description?: string;
    taskIds: string[]; // Shared Tasks
    isCompleted: boolean;
    goalId: string;
}
