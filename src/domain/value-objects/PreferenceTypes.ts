/**
 * PreferenceTypes - Central type definitions for agent preferences.
 *
 * V8 Adaptive Agents: Defines all valid preference values to enable
 * guardrails and validation.
 */

/**
 * CoachAgent tone preferences.
 */
export const COACH_TONES = ['encouraging', 'neutral', 'direct', 'gentle'] as const;
export type CoachTone = (typeof COACH_TONES)[number];

/**
 * PlannerAgent scheduling aggressiveness preferences.
 */
export const SCHEDULING_AGGRESSIVENESS = ['conservative', 'moderate', 'aggressive'] as const;
export type SchedulingAggressiveness = (typeof SCHEDULING_AGGRESSIVENESS)[number];

/**
 * LoggerAgent summarization depth preferences.
 */
export const SUMMARIZATION_DEPTHS = ['minimal', 'standard', 'detailed'] as const;
export type SummarizationDepth = (typeof SUMMARIZATION_DEPTHS)[number];

/**
 * All preference categories.
 */
export const PREFERENCE_CATEGORIES = ['communication', 'scheduling', 'logging'] as const;
export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

/**
 * Map of category -> key -> allowed values.
 */
export const PREFERENCE_ALLOWED_VALUES: Record<string, Record<string, readonly unknown[]>> = {
    communication: {
        tone: COACH_TONES,
    },
    scheduling: {
        aggressiveness: SCHEDULING_AGGRESSIVENESS,
    },
    logging: {
        summarization_depth: SUMMARIZATION_DEPTHS,
    },
};

/**
 * Default values for each preference.
 */
export const PREFERENCE_DEFAULTS: Record<string, Record<string, unknown>> = {
    communication: {
        tone: 'encouraging' as CoachTone,
    },
    scheduling: {
        aggressiveness: 'moderate' as SchedulingAggressiveness,
    },
    logging: {
        summarization_depth: 'standard' as SummarizationDepth,
    },
};

/**
 * Agent name to preference category mapping.
 */
export const AGENT_PREFERENCE_CATEGORIES: Record<string, string[]> = {
    CoachAgent: ['communication'],
    PlannerAgent: ['scheduling'],
    LoggerAgent: ['logging'],
};
