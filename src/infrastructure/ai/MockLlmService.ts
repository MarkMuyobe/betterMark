import { ILlmService, LlmResponse, LlmOptions } from '../../application/ports/ILlmService.js';

/**
 * MockLlmService - Heuristic-based implementation for testing and development.
 *
 * Provides deterministic responses based on prompt keywords.
 * All responses have high confidence since they're rule-based.
 */
export class MockLlmService implements ILlmService {
    private readonly modelId = 'mock-heuristic-v1';

    async generate(prompt: string, options?: LlmOptions): Promise<LlmResponse> {
        const startTime = Date.now();

        // Simulate some processing delay
        await this.simulateLatency();

        const content = this.generateHeuristicResponse(prompt);
        const latencyMs = Date.now() - startTime;

        // Estimate token counts (rough approximation)
        const promptTokens = Math.ceil(prompt.length / 4);
        const completionTokens = Math.ceil(content.length / 4);

        return {
            content,
            confidence: 0.95, // High confidence for rule-based responses
            latencyMs,
            costUsd: 0, // Mock service is free
            tokens: {
                prompt: promptTokens,
                completion: completionTokens,
                total: promptTokens + completionTokens,
            },
            model: this.modelId,
            fromCache: false,
        };
    }

    /**
     * @deprecated Use generate() instead
     */
    async generateText(prompt: string): Promise<string> {
        const response = await this.generate(prompt);
        return response.content;
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }

    getModelId(): string {
        return this.modelId;
    }

    private generateHeuristicResponse(prompt: string): string {
        console.log(`[MockLLM] Received Prompt: ${prompt.substring(0, 100)}...`);

        // Goal completion suggestions
        if (prompt.includes('completed a goal') || prompt.includes('Goal Completed')) {
            return "Great job on completing your goal! Consider setting a slightly more challenging goal in the same area to maintain momentum.";
        }

        // New goal encouragement
        if (prompt.includes('created a new goal') || prompt.includes('Goal Created')) {
            return "That's a solid goal to work toward. Start by breaking it into smaller tasks you can tackle this week.";
        }

        // Scheduling conflict resolution
        if (prompt.includes('Conflict') || prompt.includes('conflict')) {
            return "I recommend rescheduling to the next available hour, or consider breaking this task into smaller time blocks.";
        }

        // Event summarization
        if (prompt.includes('Summarize') || prompt.includes('summary')) {
            return "Activity logged successfully. Review your progress at the end of the day.";
        }

        return "Processed by Mock Intelligence.";
    }

    private async simulateLatency(): Promise<void> {
        // Simulate 10-50ms latency
        const delay = Math.floor(Math.random() * 40) + 10;
        return new Promise(resolve => setTimeout(resolve, delay));
    }
}
