/**
 * LlmServiceFactory - Factory for creating LLM service instances.
 *
 * Supports multiple providers with environment-based configuration.
 */

import { ILlmService } from '../../application/ports/ILlmService.js';
import { MockLlmService } from './MockLlmService.js';
import { OpenAILlmService, OpenAIConfig } from './OpenAILlmService.js';

export type LlmProvider = 'mock' | 'openai';

export interface LlmServiceConfig {
    provider: LlmProvider;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    organization?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    retryAttempts?: number;
}

/**
 * Factory for creating LLM service instances.
 */
export class LlmServiceFactory {
    /**
     * Create an LLM service from explicit configuration.
     */
    static create(config: LlmServiceConfig): ILlmService {
        switch (config.provider) {
            case 'openai':
                return LlmServiceFactory.createOpenAI(config);
            case 'mock':
            default:
                return new MockLlmService();
        }
    }

    /**
     * Create an LLM service from environment variables.
     *
     * Environment variables:
     * - LLM_PROVIDER: 'mock' | 'openai' (default: 'mock')
     * - OPENAI_API_KEY: Required for OpenAI provider
     * - OPENAI_MODEL: Model to use (default: 'gpt-4o-mini')
     * - OPENAI_BASE_URL: Custom API endpoint
     * - OPENAI_ORGANIZATION: Organization ID
     * - LLM_MAX_TOKENS: Maximum tokens (default: 500)
     * - LLM_TEMPERATURE: Temperature (default: 0.7)
     * - LLM_TIMEOUT_MS: Timeout in milliseconds (default: 30000)
     */
    static createFromEnv(): ILlmService {
        const provider = (process.env.LLM_PROVIDER ?? 'mock') as LlmProvider;

        const config: LlmServiceConfig = {
            provider,
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL,
            baseUrl: process.env.OPENAI_BASE_URL,
            organization: process.env.OPENAI_ORGANIZATION,
            maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS, 10) : undefined,
            temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : undefined,
            timeoutMs: process.env.LLM_TIMEOUT_MS ? parseInt(process.env.LLM_TIMEOUT_MS, 10) : undefined,
        };

        return LlmServiceFactory.create(config);
    }

    /**
     * Create OpenAI service with validation.
     */
    private static createOpenAI(config: LlmServiceConfig): ILlmService {
        if (!config.apiKey) {
            console.warn('[LlmServiceFactory] OpenAI API key not provided, falling back to mock service');
            return new MockLlmService();
        }

        const openAIConfig: OpenAIConfig = {
            apiKey: config.apiKey,
            model: config.model,
            baseUrl: config.baseUrl,
            organization: config.organization,
            defaultMaxTokens: config.maxTokens,
            defaultTemperature: config.temperature,
            timeoutMs: config.timeoutMs,
            retryAttempts: config.retryAttempts,
        };

        return new OpenAILlmService(openAIConfig);
    }

    /**
     * Check if a real LLM provider is configured.
     */
    static isRealProviderConfigured(): boolean {
        const provider = process.env.LLM_PROVIDER;
        if (provider === 'openai' && process.env.OPENAI_API_KEY) {
            return true;
        }
        return false;
    }

    /**
     * Get the configured provider name.
     */
    static getConfiguredProvider(): LlmProvider {
        return (process.env.LLM_PROVIDER ?? 'mock') as LlmProvider;
    }
}
