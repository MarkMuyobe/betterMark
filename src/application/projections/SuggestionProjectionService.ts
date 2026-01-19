/**
 * SuggestionProjectionService - V12 projection builder for suggestions.
 *
 * Pure projection service with:
 * - No side effects
 * - No writes
 * - No domain mutation
 * - Idempotent operations
 */

import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { PreferenceRegistry } from '../../domain/services/PreferenceRegistry.js';
import { AdaptationPolicyService } from '../services/AdaptationPolicyService.js';
import { SuggestionReadModel, SuggestionReadModelBuilder, SuggestionStatus } from '../read-models/SuggestionReadModel.js';

/**
 * Service for building suggestion read models.
 */
export class SuggestionProjectionService {
    constructor(
        private readonly learningRepository: IAgentLearningRepository,
        private readonly preferenceRegistry: PreferenceRegistry,
        private readonly policyService: AdaptationPolicyService
    ) {}

    /**
     * Build all suggestion read models for all agents.
     */
    async buildAllSuggestionReadModels(): Promise<SuggestionReadModel[]> {
        const allDefinitions = this.preferenceRegistry.getAllDefinitions();
        const agentNames = [...new Set(allDefinitions.map(d => d.agentName))];

        const readModels: SuggestionReadModel[] = [];

        for (const agentName of agentNames) {
            const agentModels = await this.buildSuggestionReadModelsForAgent(agentName);
            readModels.push(...agentModels);
        }

        return readModels;
    }

    /**
     * Build suggestion read models for a specific agent.
     */
    async buildSuggestionReadModelsForAgent(agentName: string): Promise<SuggestionReadModel[]> {
        const profile = await this.learningRepository.findByAgentName(agentName);
        if (!profile?.suggestedPreferences) {
            return [];
        }

        const policy = await this.policyService.getOrCreatePolicy(agentName);
        const readModels: SuggestionReadModel[] = [];

        for (const suggestion of profile.suggestedPreferences) {
            const preferenceKey = `${suggestion.category}.${suggestion.key}`;
            const currentPref = profile.preferences.find(
                p => p.category === suggestion.category && p.key === suggestion.key
            );
            const defaultValue = this.preferenceRegistry.getDefaultValue(suggestion.category, suggestion.key);
            const currentValue = currentPref?.value ?? defaultValue;

            // Determine if approval is required
            const riskLevel = this.preferenceRegistry.getRiskLevel(suggestion.category, suggestion.key);
            const requiresApproval = !policy.userOptedIn ||
                suggestion.confidence < policy.minConfidence ||
                !policy.allowedRiskLevels.includes(riskLevel);

            readModels.push(
                SuggestionReadModelBuilder.create()
                    .withSuggestionId(suggestion.suggestionId)
                    .withAgentType(agentName)
                    .withPreferenceKey(preferenceKey)
                    .withProposedValue(suggestion.suggestedValue)
                    .withCurrentValue(currentValue)
                    .withConfidenceScore(suggestion.confidence)
                    .withStatus(this.mapStatus(suggestion.status))
                    .withRequiresApproval(requiresApproval)
                    .withReason(suggestion.reason)
                    .withCreatedAt(suggestion.suggestedAt)
                    .build()
            );
        }

        return readModels;
    }

    /**
     * Build pending suggestion read models only.
     */
    async buildPendingSuggestionReadModels(): Promise<SuggestionReadModel[]> {
        const all = await this.buildAllSuggestionReadModels();
        return all.filter(s => s.status === 'pending');
    }

    /**
     * Build a single suggestion read model.
     */
    async buildSuggestionReadModel(
        agentName: string,
        suggestionId: string
    ): Promise<SuggestionReadModel | null> {
        const models = await this.buildSuggestionReadModelsForAgent(agentName);
        return models.find(m => m.suggestionId === suggestionId) ?? null;
    }

    /**
     * Map domain suggestion status to read model status.
     */
    private mapStatus(status: string): SuggestionStatus {
        switch (status) {
            case 'pending':
                return 'pending';
            case 'approved':
                return 'approved';
            case 'rejected':
                return 'rejected';
            case 'auto_applied':
                return 'auto_applied';
            default:
                return 'pending';
        }
    }
}
