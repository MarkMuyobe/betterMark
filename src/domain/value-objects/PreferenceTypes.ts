/**
 * PreferenceTypes - Central type definitions for agent preferences.
 *
 * V8 Adaptive Agents: Defines all valid preference values to enable
 * guardrails and validation.
 *
 * V10 Controlled Adaptation: Adds risk levels and adaptive flags.
 */

/**
 * V10: Risk level for auto-adaptation decisions.
 * - low: Safe to auto-apply (e.g., tone changes)
 * - medium: Requires higher confidence threshold
 * - high: Never auto-apply, always manual
 */
export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * V10: Adaptation mode for preferences.
 * - manual: Never auto-apply (user must approve)
 * - auto: Can be auto-applied if policy allows
 */
export const ADAPTATION_MODES = ['manual', 'auto'] as const;
export type AdaptationMode = (typeof ADAPTATION_MODES)[number];

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

/**
 * V10: Risk level for each preference (category.key -> risk level).
 * - low: Safe to auto-apply with minimal threshold
 * - medium: Requires higher confidence
 * - high: Never auto-apply
 */
export const PREFERENCE_RISK_LEVELS: Record<string, Record<string, RiskLevel>> = {
    communication: {
        tone: 'low', // Tone changes are low risk
    },
    scheduling: {
        aggressiveness: 'medium', // Scheduling changes have moderate impact
    },
    logging: {
        summarization_depth: 'low', // Logging changes are low risk
    },
};

/**
 * V10: Whether each preference supports auto-adaptation.
 * Default is false (manual only) for safety.
 */
export const PREFERENCE_ADAPTIVE_FLAGS: Record<string, Record<string, boolean>> = {
    communication: {
        tone: true, // Can be auto-adapted
    },
    scheduling: {
        aggressiveness: true, // Can be auto-adapted with higher threshold
    },
    logging: {
        summarization_depth: true, // Can be auto-adapted
    },
};

/**
 * V10: Confidence thresholds by risk level.
 */
export const RISK_LEVEL_THRESHOLDS: Record<RiskLevel, number> = {
    low: 0.7,
    medium: 0.85,
    high: 1.0, // Effectively never auto-apply (unreachable)
};
