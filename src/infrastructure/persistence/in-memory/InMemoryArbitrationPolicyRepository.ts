/**
 * InMemoryArbitrationPolicyRepository - V11 in-memory implementation.
 */

import { IArbitrationPolicyRepository } from '../../../application/ports/IArbitrationPolicyRepository.js';
import { IArbitrationPolicy, PolicyScope } from '../../../domain/entities/ArbitrationPolicy.js';

export class InMemoryArbitrationPolicyRepository implements IArbitrationPolicyRepository {
    private policies: Map<string, IArbitrationPolicy> = new Map();

    async save(policy: IArbitrationPolicy): Promise<void> {
        this.policies.set(policy.id, { ...policy });
    }

    async findById(id: string): Promise<IArbitrationPolicy | null> {
        const policy = this.policies.get(id);
        return policy ? { ...policy } : null;
    }

    async findDefault(): Promise<IArbitrationPolicy | null> {
        const defaultPolicy = Array.from(this.policies.values()).find((p) => p.isDefault);
        return defaultPolicy ? { ...defaultPolicy } : null;
    }

    async findForAgent(agentName: string): Promise<IArbitrationPolicy | null> {
        const agentPolicy = Array.from(this.policies.values()).find(
            (p) => p.scope === 'agent' && p.agentName === agentName
        );
        return agentPolicy ? { ...agentPolicy } : null;
    }

    async findForPreference(preferenceKey: string): Promise<IArbitrationPolicy | null> {
        const prefPolicy = Array.from(this.policies.values()).find(
            (p) => p.scope === 'preference' && p.preferenceKey === preferenceKey
        );
        return prefPolicy ? { ...prefPolicy } : null;
    }

    async findAll(): Promise<IArbitrationPolicy[]> {
        return Array.from(this.policies.values()).map((p) => ({ ...p }));
    }

    async findByScope(scope: PolicyScope): Promise<IArbitrationPolicy[]> {
        return Array.from(this.policies.values())
            .filter((p) => p.scope === scope)
            .map((p) => ({ ...p }));
    }

    // Test helper
    clear(): void {
        this.policies.clear();
    }
}
