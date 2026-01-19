/**
 * AuditTrailReadModel - V12 CQRS-style projection for audit trail.
 *
 * Query-optimized, UI-safe model for displaying the complete audit history.
 * This is a read-only projection - no mutations allowed.
 */

/**
 * Type of audit record.
 */
export type AuditRecordType = 'adaptation' | 'arbitration' | 'rollback' | 'suggestion' | 'approval';

/**
 * Read model for audit trail display.
 */
export interface AuditTrailReadModel {
    /** Unique ID of the audit record */
    recordId: string;
    /** Type of action being audited */
    type: AuditRecordType;
    /** Agent type involved */
    agentType: string;
    /** Target reference (what was affected) */
    targetRef: {
        type: string;
        id: string;
        key?: string;
    };
    /** Summary of the action taken */
    actionSummary: string;
    /** Reason for the action */
    reason: string;
    /** Outcome of the action */
    outcome: 'success' | 'blocked' | 'escalated' | 'rolled_back';
    /** Additional metadata */
    metadata?: Record<string, unknown>;
    /** When the action occurred */
    createdAt: Date;
}

/**
 * Builder for AuditTrailReadModel.
 */
export class AuditTrailReadModelBuilder {
    private model: Partial<AuditTrailReadModel> = {};

    static create(): AuditTrailReadModelBuilder {
        return new AuditTrailReadModelBuilder();
    }

    withRecordId(id: string): this {
        this.model.recordId = id;
        return this;
    }

    withType(type: AuditRecordType): this {
        this.model.type = type;
        return this;
    }

    withAgentType(agentType: string): this {
        this.model.agentType = agentType;
        return this;
    }

    withTargetRef(targetRef: AuditTrailReadModel['targetRef']): this {
        this.model.targetRef = targetRef;
        return this;
    }

    withActionSummary(summary: string): this {
        this.model.actionSummary = summary;
        return this;
    }

    withReason(reason: string): this {
        this.model.reason = reason;
        return this;
    }

    withOutcome(outcome: AuditTrailReadModel['outcome']): this {
        this.model.outcome = outcome;
        return this;
    }

    withMetadata(metadata: Record<string, unknown>): this {
        this.model.metadata = metadata;
        return this;
    }

    withCreatedAt(date: Date): this {
        this.model.createdAt = date;
        return this;
    }

    build(): AuditTrailReadModel {
        if (!this.model.recordId || !this.model.type || !this.model.agentType || !this.model.targetRef) {
            throw new Error('AuditTrailReadModel requires recordId, type, agentType, and targetRef');
        }

        return {
            recordId: this.model.recordId,
            type: this.model.type,
            agentType: this.model.agentType,
            targetRef: this.model.targetRef,
            actionSummary: this.model.actionSummary ?? '',
            reason: this.model.reason ?? '',
            outcome: this.model.outcome ?? 'success',
            metadata: this.model.metadata,
            createdAt: this.model.createdAt ?? new Date(),
        };
    }
}
