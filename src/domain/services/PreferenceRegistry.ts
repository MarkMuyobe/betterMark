/**
 * PreferenceRegistry - Central registry for validating preference values.
 *
 * V8 Adaptive Agents: Provides guardrails by ensuring preference values
 * stay within allowed options.
 */

import {
    PREFERENCE_ALLOWED_VALUES,
    PREFERENCE_DEFAULTS,
    AGENT_PREFERENCE_CATEGORIES,
} from '../value-objects/PreferenceTypes.js';

/**
 * A preference definition.
 */
export interface IPreferenceDefinition {
    category: string;
    key: string;
    allowedValues: readonly unknown[];
    defaultValue: unknown;
    agentName: string;
}

/**
 * Validation result.
 */
export interface IValidationResult {
    valid: boolean;
    reason?: string;
}

/**
 * PreferenceRegistry - Validates and manages preference definitions.
 */
export class PreferenceRegistry {
    private definitions: Map<string, IPreferenceDefinition> = new Map();

    /**
     * Creates a registry pre-populated with standard preference definitions.
     */
    static createDefault(): PreferenceRegistry {
        const registry = new PreferenceRegistry();
        registry.registerStandardDefinitions();
        return registry;
    }

    /**
     * Registers a single preference definition.
     */
    register(definition: IPreferenceDefinition): void {
        const key = this.makeKey(definition.category, definition.key);
        this.definitions.set(key, definition);
    }

    /**
     * Registers all standard preference definitions from PreferenceTypes.
     */
    registerStandardDefinitions(): void {
        // Register all preferences based on agent mappings
        for (const [agentName, categories] of Object.entries(AGENT_PREFERENCE_CATEGORIES)) {
            for (const category of categories) {
                const allowedValuesMap = PREFERENCE_ALLOWED_VALUES[category];
                const defaultsMap = PREFERENCE_DEFAULTS[category];

                if (allowedValuesMap && defaultsMap) {
                    for (const [key, allowedValues] of Object.entries(allowedValuesMap)) {
                        this.register({
                            category,
                            key,
                            allowedValues,
                            defaultValue: defaultsMap[key],
                            agentName,
                        });
                    }
                }
            }
        }
    }

    /**
     * Checks if a value is valid for a given preference.
     */
    isValidValue(category: string, key: string, value: unknown): boolean {
        const definition = this.getDefinition(category, key);
        if (!definition) {
            // Unknown preference - consider invalid for safety
            return false;
        }
        return definition.allowedValues.includes(value);
    }

    /**
     * Validates a preference value and returns detailed result.
     */
    validate(category: string, key: string, value: unknown): IValidationResult {
        const definition = this.getDefinition(category, key);

        if (!definition) {
            return {
                valid: false,
                reason: `Unknown preference: ${category}.${key}`,
            };
        }

        if (!definition.allowedValues.includes(value)) {
            return {
                valid: false,
                reason: `Invalid value "${value}" for ${category}.${key}. Allowed values: ${definition.allowedValues.join(', ')}`,
            };
        }

        return { valid: true };
    }

    /**
     * Gets the default value for a preference.
     */
    getDefaultValue(category: string, key: string): unknown {
        const definition = this.getDefinition(category, key);
        return definition?.defaultValue ?? null;
    }

    /**
     * Gets all default values for an agent.
     */
    getAgentDefaults(agentName: string): Record<string, Record<string, unknown>> {
        const defaults: Record<string, Record<string, unknown>> = {};

        for (const definition of this.definitions.values()) {
            if (definition.agentName === agentName) {
                if (!defaults[definition.category]) {
                    defaults[definition.category] = {};
                }
                defaults[definition.category][definition.key] = definition.defaultValue;
            }
        }

        return defaults;
    }

    /**
     * Gets the definition for a preference.
     */
    getDefinition(category: string, key: string): IPreferenceDefinition | null {
        const lookupKey = this.makeKey(category, key);
        return this.definitions.get(lookupKey) ?? null;
    }

    /**
     * Gets all definitions.
     */
    getAllDefinitions(): IPreferenceDefinition[] {
        return Array.from(this.definitions.values());
    }

    /**
     * Gets all definitions for a category.
     */
    getDefinitionsForCategory(category: string): IPreferenceDefinition[] {
        return this.getAllDefinitions().filter(d => d.category === category);
    }

    /**
     * Gets all definitions for an agent.
     */
    getDefinitionsForAgent(agentName: string): IPreferenceDefinition[] {
        return this.getAllDefinitions().filter(d => d.agentName === agentName);
    }

    /**
     * Creates a lookup key for a category/key pair.
     */
    private makeKey(category: string, key: string): string {
        return `${category}:${key}`;
    }
}
