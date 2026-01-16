/**
 * Response from an LLM call with observability metadata.
 */
export interface LlmResponse {
    /** The generated text content */
    content: string;
    /** Confidence score from 0.0 to 1.0 (if available) */
    confidence: number;
    /** Latency in milliseconds */
    latencyMs: number;
    /** Estimated cost in USD (if available) */
    costUsd: number;
    /** Token counts for observability */
    tokens: {
        prompt: number;
        completion: number;
        total: number;
    };
    /** Model identifier used */
    model: string;
    /** Whether this was a cached/fallback response */
    fromCache: boolean;
}

/**
 * Options for LLM generation
 */
export interface LlmOptions {
    /** Maximum tokens to generate */
    maxTokens?: number;
    /** Temperature for randomness (0.0 to 2.0) */
    temperature?: number;
    /** Timeout in milliseconds */
    timeoutMs?: number;
}

export interface ILlmService {
    /**
     * Generates text based on a prompt with full observability.
     * @param prompt The input prompt for the LLM.
     * @param options Optional generation parameters.
     * @returns The generated response with metadata.
     */
    generate(prompt: string, options?: LlmOptions): Promise<LlmResponse>;

    /**
     * @deprecated Use generate() instead for full observability
     * Generates text based on a prompt (legacy interface).
     * @param prompt The input prompt for the LLM.
     * @returns The generated response text only.
     */
    generateText(prompt: string): Promise<string>;

    /**
     * Checks if the service is available and healthy.
     */
    healthCheck(): Promise<boolean>;

    /**
     * Returns the model identifier being used.
     */
    getModelId(): string;
}
