import { describe, it, expect } from 'vitest';
import { calculateScore } from '../scoring/scorer.js';
import type { OpportunityItem, ClassificationResult, AppConfig } from '../types.js';
import { defaultConfig } from '../config/defaults.js';

const mockOpportunity: OpportunityItem = {
    source: 'reddit',
    source_id: 'test1',
    source_url: 'https://reddit.com/r/india/test1',
    title: 'Looking for 2BHK flat in Bangalore',
    content: 'I need a 2BHK flat near Whitefield for rent. Budget around 25k.',
    author: 'testuser',
    created_at_source: new Date().toISOString(),
    engagement: { score: 10, comments: 5, upvotes: 10 },
    raw: {},
};

const mockClassification: ClassificationResult = {
    is_real_estate_intent: true,
    intent_confidence: 0.9,
    intent_type: 'rent',
    locations: [{ name: 'Bangalore', type: 'city' }, { name: 'Whitefield', type: 'locality' }],
    budget_range: '20-40k',
    timeline: 'immediate',
    needs: ['2BHK', 'near Whitefield'],
    disallowed: false,
    reasoning_brief: 'Clear rental query for Bangalore',
};

describe('Scoring Service', () => {
    it('should calculate a score between 0 and 100', () => {
        const result = calculateScore(mockOpportunity, mockClassification, 60, defaultConfig);
        expect(result.total).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeLessThanOrEqual(100);
    });

    it('should return a breakdown with all components', () => {
        const result = calculateScore(mockOpportunity, mockClassification, 60, defaultConfig);
        expect(result).toHaveProperty('intent_score');
        expect(result).toHaveProperty('freshness_score');
        expect(result).toHaveProperty('engagement_score');
        expect(result).toHaveProperty('source_score');
        expect(result).toHaveProperty('keyword_score');
        expect(result).toHaveProperty('total');
    });

    it('should give higher score for high-confidence real estate intent', () => {
        const highConfidence = { ...mockClassification, intent_confidence: 0.95 };
        const lowConfidence = { ...mockClassification, intent_confidence: 0.2 };

        const highResult = calculateScore(mockOpportunity, highConfidence, 60, defaultConfig);
        const lowResult = calculateScore(mockOpportunity, lowConfidence, 60, defaultConfig);

        expect(highResult.total).toBeGreaterThan(lowResult.total);
    });

    it('should give higher score for fresh posts', () => {
        const fresh = { ...mockOpportunity, created_at_source: new Date().toISOString() };
        const old = { ...mockOpportunity, created_at_source: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString() };

        const freshResult = calculateScore(fresh, mockClassification, 60, defaultConfig);
        const oldResult = calculateScore(old, mockClassification, 60, defaultConfig);

        expect(freshResult.freshness_score).toBeGreaterThan(oldResult.freshness_score);
    });

    it('should give higher score for more engaged posts', () => {
        const highEngagement = { ...mockOpportunity, engagement: { score: 100, comments: 50 } };
        const lowEngagement = { ...mockOpportunity, engagement: { score: 0, comments: 0 } };

        const highResult = calculateScore(highEngagement, mockClassification, 60, defaultConfig);
        const lowResult = calculateScore(lowEngagement, mockClassification, 60, defaultConfig);

        expect(highResult.engagement_score).toBeGreaterThan(lowResult.engagement_score);
    });

    it('should respect configurable weights', () => {
        const customConfig = {
            ...defaultConfig,
            scoring: {
                ...defaultConfig.scoring,
                weights: { intent: 1.0, freshness: 0, engagement: 0, source: 0, keyword: 0 },
            },
        };

        const result = calculateScore(mockOpportunity, mockClassification, 60, customConfig);
        // Score should be purely intent-based
        expect(result.total).toBe(result.intent_score);
    });

    it('should handle zero keyword score', () => {
        const result = calculateScore(mockOpportunity, mockClassification, 0, defaultConfig);
        expect(result.keyword_score).toBe(0);
        expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('should not exceed 100', () => {
        const maxOpp = {
            ...mockOpportunity,
            created_at_source: new Date().toISOString(),
            engagement: { score: 1000, comments: 500 },
        };
        const maxClass = { ...mockClassification, intent_confidence: 1.0 };
        const result = calculateScore(maxOpp, maxClass, 100, defaultConfig);
        expect(result.total).toBeLessThanOrEqual(100);
    });
});
