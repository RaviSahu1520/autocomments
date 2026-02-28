import type { ClassificationResult, OpportunityItem, ScoreBreakdown, AppConfig } from '../types.js';

/**
 * Calculate opportunity score (0-100) with configurable weights.
 * 
 * Formula:
 *   score = w_intent * (intent_confidence * 100)
 *         + w_freshness * freshness_score
 *         + w_engagement * engagement_score
 *         + w_source * source_weight
 *         + w_keyword * keyword_score
 */
export function calculateScore(
    opportunity: OpportunityItem,
    classification: ClassificationResult,
    keywordScore: number,
    config: AppConfig
): ScoreBreakdown {
    const weights = config.scoring.weights;

    // Intent score (0-100): confidence * 100
    const intentScore = Math.round(classification.intent_confidence * 100);

    // Freshness score (0-100): how recent is the post
    const freshnessScore = calculateFreshness(opportunity.created_at_source);

    // Engagement score (0-100): based on upvotes/comments
    const engagementScore = calculateEngagement(opportunity.engagement);

    // Source weight (0-100): from config
    const sourceScore = config.scoring.source_weights[opportunity.source] ?? 50;

    // Total score
    const total = Math.round(
        weights.intent * intentScore +
        weights.freshness * freshnessScore +
        weights.engagement * engagementScore +
        weights.source * sourceScore +
        weights.keyword * keywordScore
    );

    return {
        intent_score: intentScore,
        freshness_score: freshnessScore,
        engagement_score: engagementScore,
        source_score: sourceScore,
        keyword_score: keywordScore,
        total: Math.max(0, Math.min(100, total)),
    };
}

/**
 * Freshness: 100 if < 1 hour old, decaying to 0 at ~72 hours.
 */
function calculateFreshness(createdAt: string): number {
    if (!createdAt) return 50;
    const now = Date.now();
    const created = new Date(createdAt).getTime();
    const ageHours = (now - created) / (1000 * 60 * 60);

    if (ageHours < 1) return 100;
    if (ageHours < 6) return 85;
    if (ageHours < 12) return 70;
    if (ageHours < 24) return 55;
    if (ageHours < 48) return 35;
    if (ageHours < 72) return 20;
    return 10;
}

/**
 * Engagement: logarithmic scale based on score + comments.
 */
function calculateEngagement(engagement: { score?: number; comments?: number; upvotes?: number }): number {
    const score = engagement.score ?? engagement.upvotes ?? 0;
    const comments = engagement.comments ?? 0;
    const combined = score + comments * 2; // weight comments more

    if (combined <= 0) return 20;
    if (combined < 5) return 35;
    if (combined < 20) return 50;
    if (combined < 50) return 65;
    if (combined < 100) return 75;
    if (combined < 500) return 85;
    return 95;
}
