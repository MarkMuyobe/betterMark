export interface IStreak {
    id: string;
    goalId?: string;
    habitId?: string; // If distinct from Goal
    currentStreakCount: number;
    longestStreakCount: number;
    lastActivityDate: Date;
    startDate: Date;
}
