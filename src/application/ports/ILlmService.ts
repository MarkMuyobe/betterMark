export interface ILlmService {
    /**
     * Generates text based on a prompt.
     * @param prompt The input prompt for the LLM.
     * @returns The generated response.
     */
    generateText(prompt: string): Promise<string>;

    /**
     * Optional: Analyzes a specific context (like a goal or schedule) and returns a structured suggestion.
     * This can be typed strictly in the future.
     */
    analyze?(context: any): Promise<any>;
}
