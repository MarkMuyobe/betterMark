/**
 * V9FeedbackLoop.test.ts - Integration tests for V9 feedback loop.
 *
 * Tests the full adaptive learning cycle:
 * 1. Agent makes decisions → DecisionRecords created
 * 2. User provides feedback → FeedbackCaptureService records outcomes
 * 3. Auto-suggestion analysis triggered → ISuggestedPreference created
 * 4. User approves/rejects → Preferences updated
 * 5. Analytics track effectiveness → Reports generated
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAgentLearningRepository } from '../../../infrastructure/persistence/in-memory/InMemoryAgentLearningRepository.js';
import { InMemoryDecisionRecordRepository } from '../../../infrastructure/persistence/in-memory/InMemoryDecisionRecordRepository.js';
import { PreferenceRegistry } from '../../../domain/services/PreferenceRegistry.js';
import { PreferenceSuggestionService } from '../PreferenceSuggestionService.js';
import { FeedbackCaptureService } from '../FeedbackCaptureService.js';
import { AdaptiveAnalyticsService } from '../AdaptiveAnalyticsService.js';
import { AgentGovernanceService, DecisionEventInfo } from '../AgentGovernanceService.js';
import { MockLlmService } from '../../../infrastructure/ai/MockLlmService.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

describe('V9 Feedback Loop Integration', () => {
    let learningRepository: InMemoryAgentLearningRepository;
    let decisionRecordRepository: InMemoryDecisionRecordRepository;
    let preferenceRegistry: PreferenceRegistry;
    let suggestionService: PreferenceSuggestionService;
    let feedbackService: FeedbackCaptureService;
    let analyticsService: AdaptiveAnalyticsService;
    let governanceService: AgentGovernanceService;

    beforeEach(() => {
        preferenceRegistry = PreferenceRegistry.createDefault();
        learningRepository = new InMemoryAgentLearningRepository(preferenceRegistry);
        decisionRecordRepository = new InMemoryDecisionRecordRepository();

        const mockLlm = new MockLlmService();
        governanceService = new AgentGovernanceService(
            mockLlm,
            undefined,
            undefined,
            decisionRecordRepository
        );

        suggestionService = new PreferenceSuggestionService(
            learningRepository,
            decisionRecordRepository,
            preferenceRegistry,
            { minFeedbackForSuggestion: 3, minSuggestionConfidence: 0.5 }
        );

        feedbackService = new FeedbackCaptureService(
            decisionRecordRepository,
            learningRepository,
            undefined,
            suggestionService,
            { suggestionThreshold: 3, autoTriggerSuggestions: true }
        );

        analyticsService = new AdaptiveAnalyticsService(
            learningRepository,
            decisionRecordRepository
        );
    });

    describe('FeedbackCaptureService V9 Enhancements', () => {
        it('should track feedback count since last analysis', async () => {
            // Create a decision
            const decisionId = await governanceService.createDecisionRecord(
                'CoachAgent',
                'Test suggestion',
                'rule',
                {
                    triggeringEventType: 'GoalCompleted',
                    triggeringEventId: 'event-1',
                    aggregateType: 'Goal',
                    aggregateId: 'goal-1',
                    decisionType: 'suggestion',
                }
            );

            // Capture feedback
            await feedbackService.captureFeedback({
                decisionRecordId: decisionId,
                userAccepted: true,
            });

            expect(feedbackService.getFeedbackCountSinceLastAnalysis('CoachAgent')).toBe(1);

            // Capture more feedback
            const decisionId2 = await governanceService.createDecisionRecord(
                'CoachAgent',
                'Another suggestion',
                'rule',
                {
                    triggeringEventType: 'GoalCompleted',
                    triggeringEventId: 'event-2',
                    aggregateType: 'Goal',
                    aggregateId: 'goal-2',
                    decisionType: 'suggestion',
                }
            );

            await feedbackService.captureFeedback({
                decisionRecordId: decisionId2,
                userAccepted: false,
            });

            expect(feedbackService.getFeedbackCountSinceLastAnalysis('CoachAgent')).toBe(2);
        });

        it('should auto-trigger suggestion analysis at threshold', async () => {
            // Create and provide feedback for 3 decisions (threshold is 3)
            for (let i = 0; i < 3; i++) {
                const decisionId = await governanceService.createDecisionRecord(
                    'CoachAgent',
                    `Suggestion ${i}`,
                    'rule',
                    {
                        triggeringEventType: 'GoalCompleted',
                        triggeringEventId: `event-${i}`,
                        aggregateType: 'Goal',
                        aggregateId: `goal-${i}`,
                        decisionType: 'suggestion',
                    }
                );

                const result = await feedbackService.captureFeedback({
                    decisionRecordId: decisionId,
                    userAccepted: i < 2 ? false : true, // 2 rejections, 1 acceptance
                });

                // On the 3rd feedback, suggestions should be triggered
                if (i === 2) {
                    // Counter should be reset to 0 after analysis
                    expect(feedbackService.getFeedbackCountSinceLastAnalysis('CoachAgent')).toBe(0);
                }
            }
        });

        it('should allow manual trigger of suggestion analysis', async () => {
            // Add some feedback first
            for (let i = 0; i < 5; i++) {
                const decisionId = await governanceService.createDecisionRecord(
                    'CoachAgent',
                    `Suggestion ${i}`,
                    'rule',
                    {
                        triggeringEventType: 'GoalCompleted',
                        triggeringEventId: `event-${i}`,
                        aggregateType: 'Goal',
                        aggregateId: `goal-${i}`,
                        decisionType: 'suggestion',
                    }
                );

                await feedbackService.captureFeedback({
                    decisionRecordId: decisionId,
                    userAccepted: false, // All rejections
                });
            }

            // Manually trigger analysis
            const suggestionIds = await feedbackService.triggerSuggestionAnalysis('CoachAgent');

            // Should have created suggestions (exact count depends on analysis logic)
            expect(suggestionIds).toBeDefined();
        });

        it('should reset feedback counter', () => {
            feedbackService.resetFeedbackCounter('CoachAgent');
            expect(feedbackService.getFeedbackCountSinceLastAnalysis('CoachAgent')).toBe(0);
        });
    });

    describe('AdaptiveAnalyticsService', () => {
        it('should generate suggestion adoption report', async () => {
            // Add some suggestions
            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Test suggestion 1'
            );

            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'direct',
                'Test suggestion 2'
            );

            // Approve one
            const pending = await learningRepository.getPendingSuggestions('CoachAgent');
            await learningRepository.approveSuggestion('CoachAgent', pending[0].suggestionId);

            const report = await analyticsService.getSuggestionAdoptionReport('CoachAgent');

            expect(report.totalSuggestions).toBe(2);
            expect(report.approvedSuggestions).toBe(1);
            expect(report.pendingSuggestions).toBe(1);
            expect(report.adoptionRate).toBe(1); // 1 approved / 1 decided
        });

        it('should generate learning effectiveness summary', async () => {
            // Add some feedback
            for (let i = 0; i < 5; i++) {
                const decisionId = await governanceService.createDecisionRecord(
                    'CoachAgent',
                    `Suggestion ${i}`,
                    'rule',
                    {
                        triggeringEventType: 'GoalCompleted',
                        triggeringEventId: `event-${i}`,
                        aggregateType: 'Goal',
                        aggregateId: `goal-${i}`,
                        decisionType: 'suggestion',
                    }
                );

                await feedbackService.captureFeedback({
                    decisionRecordId: decisionId,
                    userAccepted: i % 2 === 0, // Alternating
                });
            }

            const summary = await analyticsService.getLearningEffectivenessSummary('CoachAgent');

            expect(summary.agentName).toBe('CoachAgent');
            expect(summary.totalFeedbackProcessed).toBe(5);
            expect(summary.overallImprovementScore).toBeGreaterThanOrEqual(0);
            expect(summary.recommendedActions).toBeDefined();
            expect(summary.recommendedActions.length).toBeGreaterThan(0);
        });

        it('should generate system-wide adaptive learning report', async () => {
            // Add data for multiple agents
            for (const agentName of ['CoachAgent', 'PlannerAgent']) {
                for (let i = 0; i < 3; i++) {
                    const decisionId = await governanceService.createDecisionRecord(
                        agentName,
                        `Suggestion ${i}`,
                        'rule',
                        {
                            triggeringEventType: 'GoalCompleted',
                            triggeringEventId: `${agentName}-event-${i}`,
                            aggregateType: 'Goal',
                            aggregateId: `goal-${i}`,
                            decisionType: 'suggestion',
                        }
                    );

                    await feedbackService.captureFeedback({
                        decisionRecordId: decisionId,
                        userAccepted: true,
                    });
                }
            }

            const report = await analyticsService.getAdaptiveLearningReport({
                from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                to: new Date(),
            });

            expect(report.agentSummaries.length).toBeGreaterThan(0);
            expect(report.topPerformingAgent).toBeDefined();
        });

        it('should track suggestion trends', async () => {
            // Create suggestions over time
            for (let i = 0; i < 3; i++) {
                await suggestionService.createManualSuggestion(
                    'CoachAgent',
                    'communication',
                    'tone',
                    i === 0 ? 'neutral' : i === 1 ? 'direct' : 'gentle',
                    `Test suggestion ${i}`
                );
            }

            const trend = await analyticsService.getSuggestionTrend('CoachAgent', {
                from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                to: new Date(),
            });

            expect(trend.totalCreated).toBe(3);
            expect(trend.adoptionTrend).toBeDefined();
        });
    });

    describe('Full Feedback Loop Cycle', () => {
        it('should complete the entire V9 adaptive learning cycle', async () => {
            // Step 1: Agent makes decisions
            const decisionIds: string[] = [];
            for (let i = 0; i < 5; i++) {
                const decisionId = await governanceService.createDecisionRecord(
                    'CoachAgent',
                    `Encouraging message ${i}`,
                    'rule',
                    {
                        triggeringEventType: 'GoalCompleted',
                        triggeringEventId: `event-${i}`,
                        aggregateType: 'Goal',
                        aggregateId: `goal-${i}`,
                        decisionType: 'suggestion',
                    }
                );
                decisionIds.push(decisionId);
            }

            // Step 2: User provides feedback (mostly negative)
            for (let i = 0; i < decisionIds.length; i++) {
                await feedbackService.captureFeedback({
                    decisionRecordId: decisionIds[i],
                    userAccepted: false, // User doesn't like encouraging tone
                    userFeedback: 'Too enthusiastic',
                });
            }

            // Step 3: Verify feedback was captured
            const profile = await learningRepository.findByAgentName('CoachAgent');
            expect(profile?.totalFeedbackReceived).toBe(5);
            expect(profile?.overallAcceptanceRate).toBe(0); // All rejected

            // Step 4: Check analytics
            const summary = await analyticsService.getLearningEffectivenessSummary('CoachAgent');
            expect(summary.recommendedActions).toContain(
                'Low acceptance rate - consider adjusting agent preferences'
            );

            // Step 5: System creates a suggestion (manual for this test)
            const suggestionId = await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'User rejected encouraging tone 5 times'
            );

            // Step 6: User approves the suggestion
            await learningRepository.approveSuggestion('CoachAgent', suggestionId);

            // Step 7: Verify preference was updated
            const updatedProfile = await learningRepository.findByAgentName('CoachAgent');
            const tonePref = updatedProfile?.preferences.find(p => p.key === 'tone');
            expect(tonePref?.value).toBe('neutral');

            // Step 8: Verify change is in audit trail
            const history = await learningRepository.getPreferenceHistory('CoachAgent');
            expect(history.length).toBeGreaterThan(0);
            expect(history[0].newValue).toBe('neutral');

            // Step 9: Verify analytics reflect the improvement
            const adoptionReport = await analyticsService.getSuggestionAdoptionReport('CoachAgent');
            expect(adoptionReport.approvedSuggestions).toBe(1);
        });

        it('should maintain guardrails throughout the cycle', async () => {
            // Try to create an invalid suggestion
            await expect(
                suggestionService.createManualSuggestion(
                    'CoachAgent',
                    'communication',
                    'tone',
                    'aggressive', // Invalid value
                    'Should fail'
                )
            ).rejects.toThrow('Invalid preference value');

            // Guardrails are maintained
            const profile = await learningRepository.findByAgentName('CoachAgent');
            expect(profile?.suggestedPreferences.length ?? 0).toBe(0);
        });

        it('should support rollback after preference change', async () => {
            // Change preference
            const suggestionId = await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'direct',
                'Testing rollback'
            );

            await learningRepository.approveSuggestion('CoachAgent', suggestionId);

            // Verify change
            let profile = await learningRepository.findByAgentName('CoachAgent');
            let tonePref = profile?.preferences.find(p => p.key === 'tone');
            expect(tonePref?.value).toBe('direct');

            // Get history and rollback
            const history = await learningRepository.getPreferenceHistory('CoachAgent');
            expect(history.length).toBeGreaterThan(0);

            // Reset to default
            await learningRepository.resetPreference('CoachAgent', 'communication', 'tone');

            // Verify rollback
            profile = await learningRepository.findByAgentName('CoachAgent');
            tonePref = profile?.preferences.find(p => p.key === 'tone');
            expect(tonePref?.value).toBe('encouraging'); // Default value
        });
    });

    describe('Advisory Display (Read-Only)', () => {
        it('should not auto-apply pending suggestions', async () => {
            // Create a pending suggestion
            await suggestionService.createManualSuggestion(
                'CoachAgent',
                'communication',
                'tone',
                'neutral',
                'Advisory only'
            );

            // Verify suggestion exists but is NOT applied
            const profile = await learningRepository.findByAgentName('CoachAgent');
            const tonePref = profile?.preferences.find(p => p.key === 'tone');

            // Preference should not have changed (still default or undefined)
            expect(tonePref).toBeUndefined();

            // Pending suggestions should exist
            const pending = await learningRepository.getPendingSuggestions('CoachAgent');
            expect(pending.length).toBe(1);
            expect(pending[0].status).toBe('pending');
        });
    });
});
