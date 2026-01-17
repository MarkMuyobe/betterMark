/**
 * OpenAILlmService - Real OpenAI API implementation of ILlmService.
 *
 * Features:
 * - Full observability (cost, latency, tokens)
 * - Retry with exponential backoff
 * - Timeout handling
 * - Rate limit awareness
 */

import { ILlmService, LlmResponse, LlmOptions } from '../../application/ports/ILlmService.js';
import { calculateCost } from './pricing.js';

export interface OpenAIConfig {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    organization?: string;
    defaultMaxTokens?: number;
    defaultTemperature?: number;
    timeoutMs?: number;
    retryAttempts?: number;
    retryDelayMs?: number;
}

interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface OpenAIRequest {
    model: string;
    messages: OpenAIMessage[];
    max_tokens?: number;
    temperature?: number;
}

interface OpenAIUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

interface OpenAIChoice {
    index: number;
    message: {
        role: string;
        content: string;
    };
    finish_reason: string;
}

interface OpenAIResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: OpenAIChoice[];
    usage: OpenAIUsage;
}

interface OpenAIErrorResponse {
    error: {
        message: string;
        type: string;
        code: string | null;
    };
}

/**
 * OpenAI API implementation with full observability.
 */
export class OpenAILlmService implements ILlmService {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly baseUrl: string;
    private readonly organization?: string;
    private readonly defaultMaxTokens: number;
    private readonly defaultTemperature: number;
    private readonly timeoutMs: number;
    private readonly retryAttempts: number;
    private readonly retryDelayMs: number;

    constructor(config: OpenAIConfig) {
        if (!config.apiKey) {
            throw new Error('OpenAI API key is required');
        }

        this.apiKey = config.apiKey;
        this.model = config.model ?? 'gpt-4o-mini';
        this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
        this.organization = config.organization;
        this.defaultMaxTokens = config.defaultMaxTokens ?? 500;
        this.defaultTemperature = config.defaultTemperature ?? 0.7;
        this.timeoutMs = config.timeoutMs ?? 30000;
        this.retryAttempts = config.retryAttempts ?? 3;
        this.retryDelayMs = config.retryDelayMs ?? 1000;
    }

    async generate(prompt: string, options?: LlmOptions): Promise<LlmResponse> {
        const startTime = Date.now();
        const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;
        const temperature = options?.temperature ?? this.defaultTemperature;
        const timeout = options?.timeoutMs ?? this.timeoutMs;

        const request: OpenAIRequest = {
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature,
        };

        const response = await this.executeWithRetry(() =>
            this.callOpenAI(request, timeout)
        );

        const latencyMs = Date.now() - startTime;
        const promptTokens = response.usage.prompt_tokens;
        const completionTokens = response.usage.completion_tokens;
        const costUsd = calculateCost(this.model, promptTokens, completionTokens, 'openai');

        return {
            content: response.choices[0]?.message.content ?? '',
            confidence: 1.0, // OpenAI doesn't provide confidence scores
            latencyMs,
            costUsd,
            tokens: {
                prompt: promptTokens,
                completion: completionTokens,
                total: response.usage.total_tokens,
            },
            model: response.model,
            fromCache: false,
        };
    }

    async generateText(prompt: string): Promise<string> {
        const response = await this.generate(prompt);
        return response.content;
    }

    async healthCheck(): Promise<boolean> {
        try {
            // Use a minimal request to check connectivity
            const response = await this.generate('Say "ok"', { maxTokens: 5 });
            return response.content.length > 0;
        } catch {
            return false;
        }
    }

    getModelId(): string {
        return this.model;
    }

    private async callOpenAI(request: OpenAIRequest, timeout: number): Promise<OpenAIResponse> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            };

            if (this.organization) {
                headers['OpenAI-Organization'] = this.organization;
            }

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify(request),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorBody = await response.json() as OpenAIErrorResponse;
                const errorMessage = errorBody.error?.message ?? `HTTP ${response.status}`;

                // Check for rate limiting
                if (response.status === 429) {
                    throw new RateLimitError(errorMessage);
                }

                throw new OpenAIError(errorMessage, response.status);
            }

            return await response.json() as OpenAIResponse;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;

                // Don't retry on non-retryable errors
                if (error instanceof OpenAIError && !this.isRetryable(error)) {
                    throw error;
                }

                // Calculate backoff delay
                const delay = this.retryDelayMs * Math.pow(2, attempt);

                // Add jitter (0-25% of delay)
                const jitter = Math.random() * 0.25 * delay;

                await this.sleep(delay + jitter);
            }
        }

        throw lastError ?? new Error('All retry attempts failed');
    }

    private isRetryable(error: OpenAIError): boolean {
        // Retry on rate limits and server errors
        return error instanceof RateLimitError ||
            error.statusCode >= 500 ||
            error.statusCode === 408; // Request timeout
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * OpenAI-specific error.
 */
export class OpenAIError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number
    ) {
        super(message);
        this.name = 'OpenAIError';
    }
}

/**
 * Rate limit error (429).
 */
export class RateLimitError extends OpenAIError {
    constructor(message: string) {
        super(message, 429);
        this.name = 'RateLimitError';
    }
}
