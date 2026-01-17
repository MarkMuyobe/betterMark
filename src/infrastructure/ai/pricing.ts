/**
 * LLM Pricing - Token cost calculation for various models.
 *
 * Prices are in USD per 1,000 tokens.
 * Updated: January 2025
 */

export interface ModelPricing {
    promptPer1k: number;
    completionPer1k: number;
}

/**
 * OpenAI model pricing (USD per 1K tokens)
 */
export const OPENAI_PRICING: Record<string, ModelPricing> = {
    // GPT-4 Turbo
    'gpt-4-turbo': { promptPer1k: 0.01, completionPer1k: 0.03 },
    'gpt-4-turbo-preview': { promptPer1k: 0.01, completionPer1k: 0.03 },
    'gpt-4-1106-preview': { promptPer1k: 0.01, completionPer1k: 0.03 },

    // GPT-4
    'gpt-4': { promptPer1k: 0.03, completionPer1k: 0.06 },
    'gpt-4-0613': { promptPer1k: 0.03, completionPer1k: 0.06 },

    // GPT-4o (Omni)
    'gpt-4o': { promptPer1k: 0.005, completionPer1k: 0.015 },
    'gpt-4o-mini': { promptPer1k: 0.00015, completionPer1k: 0.0006 },

    // GPT-3.5 Turbo
    'gpt-3.5-turbo': { promptPer1k: 0.0005, completionPer1k: 0.0015 },
    'gpt-3.5-turbo-0125': { promptPer1k: 0.0005, completionPer1k: 0.0015 },
    'gpt-3.5-turbo-1106': { promptPer1k: 0.001, completionPer1k: 0.002 },

    // Default fallback
    'default': { promptPer1k: 0.01, completionPer1k: 0.03 },
};

/**
 * Anthropic model pricing (USD per 1K tokens)
 */
export const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
    'claude-3-opus': { promptPer1k: 0.015, completionPer1k: 0.075 },
    'claude-3-sonnet': { promptPer1k: 0.003, completionPer1k: 0.015 },
    'claude-3-haiku': { promptPer1k: 0.00025, completionPer1k: 0.00125 },
    'claude-3.5-sonnet': { promptPer1k: 0.003, completionPer1k: 0.015 },
    'default': { promptPer1k: 0.003, completionPer1k: 0.015 },
};

/**
 * Calculate cost for a given model and token counts.
 */
export function calculateCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
    provider: 'openai' | 'anthropic' = 'openai'
): number {
    const pricing = provider === 'openai' ? OPENAI_PRICING : ANTHROPIC_PRICING;
    const modelPricing = pricing[model] ?? pricing['default'];

    const promptCost = (promptTokens / 1000) * modelPricing.promptPer1k;
    const completionCost = (completionTokens / 1000) * modelPricing.completionPer1k;

    return promptCost + completionCost;
}

/**
 * Get pricing info for a model.
 */
export function getModelPricing(model: string, provider: 'openai' | 'anthropic' = 'openai'): ModelPricing {
    const pricing = provider === 'openai' ? OPENAI_PRICING : ANTHROPIC_PRICING;
    return pricing[model] ?? pricing['default'];
}
