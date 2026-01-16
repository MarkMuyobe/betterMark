export interface IActivityLog {
    id: string;
    taskId?: string; // Optional link to a planned task
    goalId?: string; // Optional link to a goal
    timestamp: Date;
    description: string;
    durationMinutes: number;
}
