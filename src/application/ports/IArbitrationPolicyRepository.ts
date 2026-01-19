/**
 * IArbitrationPolicyRepository - V11 port for storing and retrieving arbitration policies.
 */

import { IArbitrationPolicy, PolicyScope } from '../../domain/entities/ArbitrationPolicy.js';

export interface IArbitrationPolicyRepository {
    /**
     * Save a policy.
     */
    save(policy: IArbitrationPolicy): Promise<void>;

    /**
     * Find policy by ID.
     */
    findById(id: string): Promise<IArbitrationPolicy | null>;

    /**
     * Find the default policy.
     */
    findDefault(): Promise<IArbitrationPolicy | null>;

    /**
     * Find policy for a specific agent.
     */
    findForAgent(agentName: string): Promise<IArbitrationPolicy | null>;

    /**
     * Find policy for a specific preference.
     */
    findForPreference(preferenceKey: string): Promise<IArbitrationPolicy | null>;

    /**
     * Find all policies.
     */
    findAll(): Promise<IArbitrationPolicy[]>;

    /**
     * Find policies by scope.
     */
    findByScope(scope: PolicyScope): Promise<IArbitrationPolicy[]>;
}
