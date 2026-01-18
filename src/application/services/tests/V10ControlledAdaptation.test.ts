/**
 * V10ControlledAdaptation.test.ts - Integration tests for V10 Controlled Adaptation.
 *
 * Tests the full policy-gated autonomy cycle:
 * 1. User opt-in required for auto-adaptation
 * 2. Policy evaluation (cooldown, rate limit, confidence)
 * 3. Risk level restrictions
 * 4. Scope-specific restrictions
 * 5. Full audit trail
 * 6. Rollback support
 * 7. Domain events
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryAgentLearningRepository } from '../../../infrastructure/persistence/in-memory/InMemoryAgentLearningRepository.js';
import { PreferenceRegistry } from '../../../domain/services/PreferenceRegistry.js';
import {
    AdaptationPolicyService,
    InMemoryAdaptationPolicyRepository,
} from '../AdaptationPolicyService.js';
import {
    AutoAdaptationService,
    InMemoryAutoAdaptationAttemptRepository,
} from '../AutoAdaptationService.js';
import { PreferenceSuggestionService } from '../PreferenceSuggestionService.js';
import { InMemoryDecisionRecordRepository } from '../../../infrastructure/persistence/in-memory/InMemoryDecisionRecordRepository.js';
import { InMemoryEventDispatcher } from '../../../infrastructure/messaging/InMemoryEventDispatcher.js';
import { PreferenceAutoApplied } from '../../../domain/events/PreferenceAutoApplied.js';
import { PreferenceAutoBlocked } from '../../../domain/events/PreferenceAutoBlocked.js';
import { PreferenceAutoSkipped } from '../../../domain/events/PreferenceAutoSkipped.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

describe('V10 Controlled Adaptation', () => {
    let learningRepository: InMemoryAgentLearningRepository;
    let decisionRepository: InMemoryDecisionRecordRepository;
    let preferenceRegistry: PreferenceRegistry;
    let policyRepository: InMemoryAdaptationPolicyRepository;
    let attemptRepository: InMemoryAutoAdaptationAttemptRepository;
    let policyService: AdaptationPolicyService;
    let autoAdaptService: AutoAdaptationService;
    let suggestionService: PreferenceSuggestionService;
    let eventDispatcher: InMemoryEventDispatcher;

    beforeEach(() => {
        preferenceRegistry = PreferenceRegistry.createDefault();
        learningRepository = new InMemoryAgentLearningRepository(preferenceRegistry);
        decisionRepository = new InMemoryDecisionRecordRepository();
        policyRepository = new InMemoryAdaptationPolicyRepository();
        attemptRepository = new InMemoryAutoAdaptationAttemptRepository();
        eventDispatcher = new InMemoryEventDispatcher();

        policyService = new AdaptationPolicyService(
            policyRepository,
            preferenceRegistry
        );

        autoAdaptService = new AutoAdaptationService(
            learningRepository,
            policyService,
            attemptRepository,
            preferenceRegistry,
            eventDispatcher
        );

        suggestionService = new PreferenceSuggestionService(
            learningRepository,
            decisionRepository,
            preferenceRegistry,
            { minFeedbackForSuggestion: 3, minSuggestionConfidence: 0.5 }
        );
    });

    // ========== Mandatory Test Case 1: User opt-in required ==========
    describe('User Opt-In Required', () => {
        it('should block auto-adaptation when user has not opted in', async () => {
            // Create a suggestion
            const suggestionId = await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Test suggestion'
            );

            // Process without opt-in
            const results = await autoAdaptService.processAgentSuggestions('CoachAgent');

            expect(results.blocked).toBe(1);
            expect(results.applied).toBe(0);
            expect(results.results[0].reason).toBe('user_not_opted_in');

            // Verify preference was NOT changed
            const profile = await learningRepository.findByAgentName('CoachAgent');
            const tonePref = profile?.preferences.find(p => p.key === 'tone');
            expect(tonePref).toBeUndefined();
        });

        it('should allow auto-adaptation after user opts in', async () => {
            // Opt in
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low', 'medium'],
            });

            // Create a high-confidence suggestion
            const suggestionId = await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Test suggestion',
                0.9 // High confidence
            );

            // Process with opt-in
            const results = await autoAdaptService.processAgentSuggestions('CoachAgent');

            expect(results.applied).toBe(1);
            expect(results.blocked).toBe(0);

            // Verify preference was changed
            const profile = await learningRepository.findByAgentName('CoachAgent');
            const tonePref = profile?.preferences.find(p => p.key === 'tone');
            expect(tonePref?.value).toBe('neutral');
        });
    });

    // ========== Mandatory Test Case 2: Cooldown enforcement ==========
    describe('Cooldown Enforcement', () => {
        it('should block adaptation during cooldown period', async () => {
            // Opt in with short cooldown
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'],
            });

            // Create and apply first suggestion
            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'First suggestion',
                0.9
            );

            const firstResult = await autoAdaptService.processAgentSuggestions('CoachAgent');
            expect(firstResult.applied).toBe(1);

            // Create second suggestion immediately
            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'direct',
                'Second suggestion',
                0.9
            );

            // Should be blocked by cooldown
            const secondResult = await autoAdaptService.processAgentSuggestions('CoachAgent');
            expect(secondResult.blocked).toBe(1);
            expect(secondResult.results[0].reason).toBe('cooldown_not_elapsed');
        });
    });

    // ========== Mandatory Test Case 3: Rate limiting ==========
    describe('Rate Limiting', () => {
        it('should enforce rate limits on auto-adaptations', async () => {
            // Opt in with strict rate limit
            const policy = await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'],
                cooldownMs: 0, // No cooldown for this test
            });

            // Update rate limit to 2 per hour
            const updatedPolicy = {
                ...policy,
                rateLimit: { maxChanges: 2, windowMs: 3600000 },
            };
            await policyRepository.save(updatedPolicy);

            // Apply first
            await suggestionService.createManualSuggestion('CoachAgent', 'communication', 'tone', 'neutral', 'S1', 0.9);
            const r1 = await autoAdaptService.processAgentSuggestions('CoachAgent');
            expect(r1.applied).toBe(1);

            // Apply second
            await suggestionService.createManualSuggestion('CoachAgent', 'communication', 'tone', 'direct', 'S2', 0.9);
            const r2 = await autoAdaptService.processAgentSuggestions('CoachAgent');
            expect(r2.applied).toBe(1);

            // Third should be blocked by rate limit
            await suggestionService.createManualSuggestion('CoachAgent', 'communication', 'tone', 'gentle', 'S3', 0.9);
            const r3 = await autoAdaptService.processAgentSuggestions('CoachAgent');
            expect(r3.blocked).toBe(1);
            expect(r3.results[0].reason).toBe('rate_limit_exceeded');
        });
    });

    // ========== Mandatory Test Case 4: Confidence threshold ==========
    describe('Confidence Threshold', () => {
        it('should block adaptation when confidence is below threshold', async () => {
            // Opt in with high confidence threshold
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.8,
                allowedRiskLevels: ['low'],
            });

            // Create low-confidence suggestion
            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Low confidence suggestion',
                0.5 // Below threshold
            );

            const results = await autoAdaptService.processAgentSuggestions('CoachAgent');

            expect(results.blocked).toBe(1);
            expect(results.results[0].reason).toBe('confidence_too_low');
        });

        it('should apply adaptation when confidence meets threshold', async () => {
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.7,
                allowedRiskLevels: ['low'],
            });

            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'High confidence suggestion',
                0.85 // Above threshold
            );

            const results = await autoAdaptService.processAgentSuggestions('CoachAgent');

            expect(results.applied).toBe(1);
        });
    });

    // ========== Mandatory Test Case 5: Risk level restrictions ==========
    describe('Risk Level Restrictions', () => {
        it('should block medium-risk preferences when only low-risk is allowed', async () => {
            // Opt in with low-risk only
            await policyService.enableAutoAdaptation('PlannerAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'], // scheduling.aggressiveness is medium risk
            });

            await suggestionService.createManualSuggestion(
                'PlannerAgent',
                'scheduling',
                'aggressiveness',
                'aggressive',
                'Risky suggestion',
                0.9
            );

            const results = await autoAdaptService.processAgentSuggestions('PlannerAgent');

            expect(results.blocked).toBe(1);
            expect(results.results[0].reason).toBe('risk_level_not_allowed');
        });

        it('should allow medium-risk when explicitly permitted', async () => {
            await policyService.enableAutoAdaptation('PlannerAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low', 'medium'],
            });

            await suggestionService.createManualSuggestion(
                'PlannerAgent',
                'scheduling',
                'aggressiveness',
                'aggressive',
                'Allowed risky suggestion',
                0.9
            );

            const results = await autoAdaptService.processAgentSuggestions('PlannerAgent');

            expect(results.applied).toBe(1);
        });
    });

    // ========== Mandatory Test Case 6: Preference locking ==========
    describe('Preference Locking', () => {
        it('should block adaptation on locked preferences', async () => {
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'],
            });

            // Lock the tone preference
            await policyService.lockPreference('CoachAgent', 'communication', 'tone');

            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Locked suggestion',
                0.9
            );

            const results = await autoAdaptService.processAgentSuggestions('CoachAgent');

            expect(results.blocked).toBe(1);
            expect(results.results[0].reason).toBe('preference_locked');
        });

        it('should allow adaptation after unlocking', async () => {
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'],
            });

            // Lock then unlock
            await policyService.lockPreference('CoachAgent', 'communication', 'tone');
            await policyService.unlockPreference('CoachAgent', 'communication', 'tone');

            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Unlocked suggestion',
                0.9
            );

            const results = await autoAdaptService.processAgentSuggestions('CoachAgent');

            expect(results.applied).toBe(1);
        });
    });

    // ========== Mandatory Test Case 7: Rollback support ==========
    describe('Rollback Support', () => {
        it('should rollback auto-applied preferences', async () => {
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'],
            });

            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Rollback test',
                0.9
            );

            const results = await autoAdaptService.processAgentSuggestions('CoachAgent');
            expect(results.applied).toBe(1);

            const attemptId = results.results[0].attemptId;

            // Verify preference was changed
            let profile = await learningRepository.findByAgentName('CoachAgent');
            let tonePref = profile?.preferences.find(p => p.key === 'tone');
            expect(tonePref?.value).toBe('neutral');

            // Rollback
            const success = await autoAdaptService.rollback(attemptId, 'User requested rollback');
            expect(success).toBe(true);

            // Verify preference was restored to default
            profile = await learningRepository.findByAgentName('CoachAgent');
            tonePref = profile?.preferences.find(p => p.key === 'tone');
            expect(tonePref?.value).toBe('encouraging'); // Default value
        });

        it('should rollback all auto-applied preferences for an agent', async () => {
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'],
            });

            // Apply a change
            await suggestionService.createManualSuggestion('CoachAgent', 'communication', 'tone', 'neutral', 'S1', 0.9);
            const r1 = await autoAdaptService.processAgentSuggestions('CoachAgent');
            expect(r1.applied).toBe(1);

            // Verify change was applied
            let profile = await learningRepository.findByAgentName('CoachAgent');
            let tonePref = profile?.preferences.find(p => p.key === 'tone');
            expect(tonePref?.value).toBe('neutral');

            // Rollback all (just one in this case)
            const rolledBackCount = await autoAdaptService.rollbackAll('CoachAgent', 'Full rollback');
            expect(rolledBackCount).toBe(1);

            // Verify restored to default
            profile = await learningRepository.findByAgentName('CoachAgent');
            tonePref = profile?.preferences.find(p => p.key === 'tone');
            expect(tonePref?.value).toBe('encouraging');
        });
    });

    // ========== Additional Tests ==========

    describe('Domain Events', () => {
        it('should emit PreferenceAutoApplied event on successful adaptation', async () => {
            const appliedHandler = vi.fn();
            eventDispatcher.subscribe('PreferenceAutoApplied', { handle: appliedHandler });

            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'],
            });

            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Event test',
                0.9
            );

            await autoAdaptService.processAgentSuggestions('CoachAgent');

            expect(appliedHandler).toHaveBeenCalledTimes(1);
            const event = appliedHandler.mock.calls[0][0] as PreferenceAutoApplied;
            expect(event.agentName).toBe('CoachAgent');
            expect(event.category).toBe('communication');
            expect(event.key).toBe('tone');
            expect(event.newValue).toBe('neutral');
        });

        it('should emit PreferenceAutoBlocked event when blocked', async () => {
            const blockedHandler = vi.fn();
            eventDispatcher.subscribe('PreferenceAutoBlocked', { handle: blockedHandler });

            // No opt-in
            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Blocked event test',
                0.9
            );

            await autoAdaptService.processAgentSuggestions('CoachAgent');

            expect(blockedHandler).toHaveBeenCalledTimes(1);
            const event = blockedHandler.mock.calls[0][0] as PreferenceAutoBlocked;
            expect(event.agentName).toBe('CoachAgent');
            expect(event.blockReason).toBe('user_not_opted_in');
        });

        it('should emit PreferenceAutoSkipped event when skipped', async () => {
            const skippedHandler = vi.fn();
            eventDispatcher.subscribe('PreferenceAutoSkipped', { handle: skippedHandler });

            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'],
            });

            // Set preference to the value we'll suggest
            const profile = await learningRepository.getOrCreate('CoachAgent');
            await learningRepository.setPreference('CoachAgent', {
                preferenceId: IdGenerator.generate(),
                category: 'communication',
                key: 'tone',
                value: 'neutral',
                confidence: 1.0,
                learnedFrom: [],
                lastUpdated: new Date(),
            });

            // Suggest the same value
            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Skip test',
                0.9
            );

            await autoAdaptService.processAgentSuggestions('CoachAgent');

            expect(skippedHandler).toHaveBeenCalledTimes(1);
            const event = skippedHandler.mock.calls[0][0] as PreferenceAutoSkipped;
            expect(event.skipReason).toBe('preference_already_at_suggested_value');
        });
    });

    describe('Audit Trail', () => {
        it('should maintain full audit trail of attempts', async () => {
            // Process without opt-in (will be blocked)
            await suggestionService.createManualSuggestion('CoachAgent', 'communication', 'tone', 'neutral', 'A1', 0.9);
            const r1 = await autoAdaptService.processAgentSuggestions('CoachAgent');
            expect(r1.blocked).toBe(1);

            const history = await autoAdaptService.getHistory('CoachAgent');

            // Verify audit trail records the blocked attempt
            expect(history.length).toBe(1);
            expect(history[0].result).toBe('blocked');
            expect(history[0].blockReason).toBe('user_not_opted_in');
            expect(history[0].agentName).toBe('CoachAgent');
            expect(history[0].category).toBe('communication');
            expect(history[0].key).toBe('tone');
        });

        it('should include policy snapshot in attempt records', async () => {
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.75,
                allowedRiskLevels: ['low', 'medium'],
            });

            await suggestionService.createManualSuggestion('CoachAgent', 'communication', 'tone', 'neutral', 'Snapshot', 0.9);
            await autoAdaptService.processAgentSuggestions('CoachAgent');

            const history = await autoAdaptService.getHistory('CoachAgent');

            expect(history[0].policySnapshot).toEqual({
                mode: 'auto',
                userOptedIn: true,
                minConfidence: 0.75,
                allowedRiskLevels: ['low', 'medium'],
            });
        });
    });

    describe('Policy Status', () => {
        it('should return accurate policy status', async () => {
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.7,
                allowedRiskLevels: ['low'],
            });

            await policyService.lockPreference('CoachAgent', 'communication', 'tone');

            const status = await policyService.getPolicyStatus('CoachAgent');

            expect(status.enabled).toBe(true);
            expect(status.mode).toBe('auto');
            expect(status.minConfidence).toBe(0.7);
            expect(status.allowedRiskLevels).toContain('low');
            expect(status.lockedPreferences).toContain('communication.tone');
        });
    });

    describe('Stats', () => {
        it('should provide accurate statistics', async () => {
            await policyService.enableAutoAdaptation('CoachAgent', {
                minConfidence: 0.6,
                allowedRiskLevels: ['low'],
                cooldownMs: 0,
            });

            // One applied
            await suggestionService.createManualSuggestion('CoachAgent', 'communication', 'tone', 'neutral', 'S1', 0.9);
            await autoAdaptService.processAgentSuggestions('CoachAgent');

            // One blocked (lock)
            await policyService.lockPreference('CoachAgent', 'communication', 'tone');
            await suggestionService.createManualSuggestion('CoachAgent', 'communication', 'tone', 'direct', 'S2', 0.9);
            await autoAdaptService.processAgentSuggestions('CoachAgent');

            const stats = await autoAdaptService.getStats('CoachAgent');

            expect(stats.totalAttempts).toBe(2);
            expect(stats.applied).toBe(1);
            expect(stats.blocked).toBe(1);
        });
    });
});
