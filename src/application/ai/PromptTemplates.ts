/**
 * PromptTemplates - Centralized prompt management for AI interactions.
 *
 * All AI prompts are defined here for:
 * - Consistency across agents
 * - Easy auditing and modification
 * - Version control of prompt engineering
 * - Testability
 */

export interface PromptContext {
    [key: string]: string | number | boolean | undefined;
}

export interface PromptTemplate {
    readonly name: string;
    readonly template: string;
    readonly requiredFields: string[];
    readonly version: string;
}

/**
 * Interpolates a template string with context values.
 * Uses {{fieldName}} syntax for placeholders.
 */
function interpolate(template: string, context: PromptContext): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = context[key];
        return value !== undefined ? String(value) : `{{${key}}}`;
    });
}

/**
 * Validates that all required fields are present in context.
 */
function validateContext(template: PromptTemplate, context: PromptContext): void {
    const missing = template.requiredFields.filter(field => context[field] === undefined);
    if (missing.length > 0) {
        throw new Error(`Missing required fields for prompt "${template.name}": ${missing.join(', ')}`);
    }
}

// ============================================
// Coach Agent Prompts
// ============================================

export const COACH_GOAL_COMPLETED: PromptTemplate = {
    name: 'coach_goal_completed',
    version: '1.0.0',
    requiredFields: ['goalTitle', 'difficulty', 'facet'],
    template: `You are a supportive personal coach. A user has completed a goal.

Goal: {{goalTitle}}
Difficulty: {{difficulty}}
Life Area: {{facet}}

Provide a brief, encouraging response (2-3 sentences) that:
1. Acknowledges their achievement
2. Suggests a logical next step or challenge

Keep the tone warm but professional. Do not use excessive exclamation marks.`,
};

export const COACH_GOAL_CREATED: PromptTemplate = {
    name: 'coach_goal_created',
    version: '1.0.0',
    requiredFields: ['goalTitle', 'difficulty', 'facet'],
    template: `You are a supportive personal coach. A user has created a new goal.

Goal: {{goalTitle}}
Difficulty: {{difficulty}}
Life Area: {{facet}}

Provide a brief motivational response (2-3 sentences) that:
1. Validates their goal choice
2. Offers one practical tip for getting started

Keep the tone encouraging but realistic.`,
};

// ============================================
// Logger Agent Prompts
// ============================================

export const LOGGER_SUMMARIZE_EVENTS: PromptTemplate = {
    name: 'logger_summarize_events',
    version: '1.0.0',
    requiredFields: ['eventCount', 'timeRange', 'eventTypes'],
    template: `Summarize the following activity for a personal productivity system.

Number of events: {{eventCount}}
Time range: {{timeRange}}
Event types: {{eventTypes}}

Provide a concise 1-2 sentence summary suitable for a daily digest.`,
};

// ============================================
// Planner Agent Prompts
// ============================================

export const PLANNER_RESOLVE_CONFLICT: PromptTemplate = {
    name: 'planner_resolve_conflict',
    version: '1.0.0',
    requiredFields: ['taskTitle', 'requestedTime', 'conflictingBlockLabel'],
    template: `A scheduling conflict was detected.

Task: {{taskTitle}}
Requested time: {{requestedTime}}
Conflicts with: {{conflictingBlockLabel}}

Suggest an alternative approach in 1-2 sentences. Consider:
- Rescheduling to a later time
- Breaking the task into smaller blocks
- Prioritization advice`,
};

// ============================================
// Prompt Builder
// ============================================

export class PromptBuilder {
    private templates: Map<string, PromptTemplate> = new Map();

    constructor() {
        // Register all templates
        this.register(COACH_GOAL_COMPLETED);
        this.register(COACH_GOAL_CREATED);
        this.register(LOGGER_SUMMARIZE_EVENTS);
        this.register(PLANNER_RESOLVE_CONFLICT);
    }

    register(template: PromptTemplate): void {
        this.templates.set(template.name, template);
    }

    build(templateName: string, context: PromptContext): string {
        const template = this.templates.get(templateName);
        if (!template) {
            throw new Error(`Unknown prompt template: ${templateName}`);
        }
        validateContext(template, context);
        return interpolate(template.template, context);
    }

    getTemplate(templateName: string): PromptTemplate | undefined {
        return this.templates.get(templateName);
    }

    listTemplates(): string[] {
        return Array.from(this.templates.keys());
    }
}

// Singleton instance for convenience
export const promptBuilder = new PromptBuilder();
