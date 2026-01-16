// Manual type definitions matching Schema (since generation failed in env)

export enum Facet {
    Health = 'Health',
    Finance = 'Finance',
    Career = 'Career',
    Education = 'Education',
    Business = 'Business',
    Relationships = 'Relationships',
    Habits = 'Habits',
    Mentality = 'Mentality',
}

export enum DifficultyProfile {
    Easy = 'Easy',
    Medium = 'Medium',
    Hard = 'Hard',
    Extreme = 'Extreme',
}

export interface Goal {
    id: string;
    title: string;
    description: string | null;
    facet: string;
    difficulty: string;
    createdAt: Date;
    updatedAt: Date;
    // Relations
    subGoals?: (SubGoal & { tasks?: Task[] })[];
    streaks?: Streak[];
    activityLogs?: ActivityLog[];
}

export interface SubGoal {
    id: string;
    title: string;
    description: string | null;
    isCompleted: boolean;
    order: number;
    goalId: string;
    // Relations
    tasks?: Task[];
}

export interface Task {
    id: string;
    title: string;
    description: string | null;
    isCompleted: boolean;
    location: string | null;
    requiredEnergy: number | null;
    requiredTools: string | null;
    estimatedMinutes: number | null;
    deadline: Date | null;
    difficulty: string;
    subGoalId: string;
    // Relations
    scheduleBlocks?: ScheduleBlock[];
    activityLogs?: ActivityLog[];
}

export interface ScheduleBlock {
    id: string;
    startTime: Date;
    endTime: Date;
    label: string;
    isFixed: boolean;
    taskId: string | null;
}

export interface JournalEntry {
    id: string;
    date: Date;
    content: string;
    tags: string[];
    imageUrls: string[];
    audioUrls: string[];
    createdAt: Date;
}

export interface ActivityLog {
    id: string;
    timestamp: Date;
    description: string;
    durationMinutes: number;
    taskId: string | null;
    goalId: string | null;
}

export interface MetricSnapshot {
    id: string;
    timestamp: Date;
    key: string;
    value: string;
    unit: string;
}

export interface Streak {
    id: string;
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: Date;
    startDate: Date;
    goalId: string | null;
}

export interface CoachAgent {
    id: string;
    facet: string;
    name: string;
    personalityProfile: string | null;
    goalId: string;
}

export interface SuperAgent {
    id: string;
    name: string;
}
