import { ILlmService } from '../../application/ports/ILlmService.js';

export class MockLlmService implements ILlmService {
    async generateText(prompt: string): Promise<string> {
        console.log(`[MockLLM] Received Prompt: ${prompt}`);

        // Simple Heuristics for "Fake" Intelligence
        if (prompt.includes('Goal Completed')) {
            return "Great job! Consider attempting a similar goal with higher difficulty next time.";
        }

        if (prompt.includes('Conflict')) {
            return "I recommend rescheduling to the next available hour.";
        }

        return "Processed by Mock Intelligence.";
    }
}
