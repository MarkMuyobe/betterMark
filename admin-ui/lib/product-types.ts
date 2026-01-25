/**
 * Product UI Types - V15 User-Facing Product UI
 */

// Re-export common types
export type { PaginationMeta, PaginatedResponse } from './types';

// Facets and Difficulty
export type Facet = 'Health' | 'Finance' | 'Career' | 'Education' | 'Business' | 'Relationships' | 'Habits' | 'Mentality';
export type DifficultyProfile = 'Easy' | 'Medium' | 'Hard' | 'Expert';
export type TaskStatus = 'pending' | 'completed' | 'overdue';

// Goal Read Models
export interface GoalListReadModel {
    id: string;
    title: string;
    description?: string;
    facet: Facet;
    difficulty: DifficultyProfile;
    isCompleted: boolean;
    progressPercent: number;
    subGoalCount: number;
    taskCount: number;
    completedTaskCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface TaskSummary {
    id: string;
    title: string;
    description?: string;
    isCompleted: boolean;
    difficulty: DifficultyProfile;
    estimatedDurationMinutes?: number;
    deadline?: string;
}

export interface SubGoalWithTasks {
    id: string;
    title: string;
    description?: string;
    isCompleted: boolean;
    tasks: TaskSummary[];
    progressPercent: number;
}

export interface GoalDetailReadModel {
    id: string;
    title: string;
    description?: string;
    facet: Facet;
    difficulty: DifficultyProfile;
    isCompleted: boolean;
    progressPercent: number;
    coachAgentId: string;
    subGoals: SubGoalWithTasks[];
    totalTaskCount: number;
    completedTaskCount: number;
    createdAt: string;
    updatedAt: string;
}

// SubGoal Read Model
export interface SubGoalReadModel {
    id: string;
    title: string;
    description?: string;
    goalId: string;
    isCompleted: boolean;
    taskCount: number;
}

// Task Read Models
export interface TaskListReadModel {
    id: string;
    title: string;
    description?: string;
    isCompleted: boolean;
    status: TaskStatus;
    difficulty: DifficultyProfile;
    estimatedDurationMinutes?: number;
    deadline?: string;
    subGoalId: string;
    subGoalTitle: string;
    goalId: string;
    goalTitle: string;
    goalFacet: Facet;
    isScheduled: boolean;
    scheduledDate?: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
}

// Schedule Read Models
export interface ScheduleBlockReadModel {
    id: string;
    startTime: string;
    endTime: string;
    label: string;
    isFixed: boolean;
    taskId?: string;
    taskTitle?: string;
    taskIsCompleted?: boolean;
    goalId?: string;
    goalTitle?: string;
    goalFacet?: Facet;
}

export interface ScheduleConflict {
    blockId1: string;
    blockId2: string;
    overlapMinutes: number;
    description: string;
}

export interface AvailableSlot {
    startTime: string;
    endTime: string;
    durationMinutes: number;
}

export interface ScheduleDayReadModel {
    date: string;
    blocks: ScheduleBlockReadModel[];
    conflicts: ScheduleConflict[];
    availableSlots: AvailableSlot[];
    totalScheduledMinutes: number;
    totalAvailableMinutes: number;
}

// Activity and Journal Read Models
export type ActivityType = 'task_completed' | 'goal_completed' | 'task_scheduled' | 'manual_log';

export interface ActivityLogReadModel {
    id: string;
    type: ActivityType;
    description: string;
    timestamp: string;
    durationMinutes?: number;
    taskId?: string;
    taskTitle?: string;
    goalId?: string;
    goalTitle?: string;
}

export interface JournalEntryReadModel {
    id: string;
    content: string;
    date: string;
    tags: string[];
    imageUrls?: string[];
    audioUrls?: string[];
    createdAt: string;
}

export interface ActivitySummary {
    totalActivities: number;
    totalMinutes: number;
    taskCompletions: number;
    goalCompletions: number;
}

// Request/Input types
export interface CreateGoalInput {
    title: string;
    description?: string;
    facet: Facet;
    difficulty: DifficultyProfile;
}

export interface UpdateGoalInput {
    title?: string;
    description?: string;
    facet?: Facet;
    difficulty?: DifficultyProfile;
}

export interface CreateSubGoalInput {
    goalId: string;
    title: string;
    description?: string;
}

export interface CreateTaskInput {
    subGoalId: string;
    title: string;
    description?: string;
    difficulty?: DifficultyProfile;
    estimatedDurationMinutes?: number;
    deadline?: string;
}

export interface ScheduleAssignInput {
    taskId: string;
    startTime: string;
    endTime: string;
}

export interface LogActivityInput {
    description: string;
    taskId?: string;
    goalId?: string;
    durationMinutes?: number;
    timestamp?: string;
}

export interface WriteJournalInput {
    content: string;
    tags?: string[];
    date?: string;
}

// Facet colors for UI
export const FACET_COLORS: Record<Facet, { bg: string; text: string; border: string }> = {
    Health: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    Finance: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
    Career: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
    Education: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
    Business: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
    Relationships: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
    Habits: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
    Mentality: { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' },
};

// Difficulty colors for UI
export const DIFFICULTY_COLORS: Record<DifficultyProfile, { bg: string; text: string }> = {
    Easy: { bg: 'bg-green-100', text: 'text-green-700' },
    Medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    Hard: { bg: 'bg-orange-100', text: 'text-orange-700' },
    Expert: { bg: 'bg-red-100', text: 'text-red-700' },
};
