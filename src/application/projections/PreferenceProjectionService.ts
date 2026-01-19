/**
 * PreferenceProjectionService - V12 projection builder for preferences.
 *
 * Pure projection service with:
 * - No side effects
 * - No writes
 * - No domain mutation
 * - Idempotent operations
 */

import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { PreferenceRegistry } from '../../domain/services/PreferenceRegistry.js';
import { IAutoAdaptationAttemptRepository } from '../services/AutoAdaptationService.js';
import { PreferenceReadModel, PreferenceReadModelBuilder, ChangeSource } from '../read-models/PreferenceReadModel.js';

/**
 * Service for building preference read models.
 */
export class PreferenceProjectionService {
    constructor(
        private readonly learningRepository: IAgentLearningRepository,
        private readonly preferenceRegistry: PreferenceRegistry,
        private readonly attemptRepository: IAutoAdaptationAttemptRepository
    ) {}

    /**
     * Build all preference read models for all agents.
     */
    async buildAllPreferenceReadModels(): Promise<PreferenceReadModel[]> {
        const allDefinitions = this.preferenceRegistry.getAllDefinitions();
        const readModels: PreferenceReadModel[] = [];

        // Group by agent
        const byAgent = new Map<string, typeof allDefinitions>();
        for (const def of allDefinitions) {
            const existing = byAgent.get(def.agentName) ?? [];
            existing.push(def);
            byAgent.set(def.agentName, existing);
        }

        // Build read models for each agent
        for (const [agentName, definitions] of byAgent) {
            const agentModels = await this.buildPreferenceReadModelsForAgent(agentName, definitions);
            readModels.push(...agentModels);
        }

        return readModels;
    }

    /**
     * Build preference read models for a specific agent.
     */
    async buildPreferenceReadModelsForAgent(
        agentName: string,
        definitions?: Array<{
            category: string;
            key: string;
            allowedValues: readonly unknown[];
            defaultValue: unknown;
            agentName: string;
        }>
    ): Promise<PreferenceReadModel[]> {
        const profile = await this.learningRepository.findByAgentName(agentName);
        const defs = definitions ?? this.preferenceRegistry.getAllDefinitions().filter(d => d.agentName === agentName);

        const readModels: PreferenceReadModel[] = [];

        for (const def of defs) {
            const preferenceKey = `${def.category}.${def.key}`;
            const currentPref = profile?.preferences.find(
                p => p.category === def.category && p.key === def.key
            );

            const currentValue = currentPref?.value ?? def.defaultValue;
            const adaptive = this.preferenceRegistry.isAdaptive(def.category, def.key);
            const riskLevel = this.preferenceRegistry.getRiskLevel(def.category, def.key);

            // Get last change info from preference change history
            const history = profile?.preferenceChangeHistory?.filter(
                h => h.category === def.category && h.key === def.key
            ) ?? [];
            const lastChange = history.length > 0 ? history[history.length - 1] : null;

            // Check if rollback is available
            const appliedAttempts = await this.attemptRepository.query({
                agentName,
                result: 'applied',
                rolledBack: false,
            });
            const rollbackAvailable = appliedAttempts.some(
                a => a.category === def.category && a.key === def.key
            );

            readModels.push(
                PreferenceReadModelBuilder.create()
                    .withAgentType(agentName)
                    .withPreferenceKey(preferenceKey)
                    .withCurrentValue(currentValue)
                    .withDefaultValue(def.defaultValue)
                    .withAdaptive(adaptive)
                    .withRiskLevel(riskLevel)
                    .withLastChange(
                        lastChange?.changedAt ?? null,
                        lastChange ? (lastChange.changedBy === 'learning' ? 'auto' : 'manual') as ChangeSource : null
                    )
                    .withRollbackAvailable(rollbackAvailable)
                    .build()
            );
        }

        return readModels;
    }

    /**
     * Build a single preference read model.
     */
    async buildPreferenceReadModel(
        agentName: string,
        category: string,
        key: string
    ): Promise<PreferenceReadModel | null> {
        const models = await this.buildPreferenceReadModelsForAgent(agentName);
        const preferenceKey = `${category}.${key}`;
        return models.find(m => m.preferenceKey === preferenceKey) ?? null;
    }
}
