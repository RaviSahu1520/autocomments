// ─── Core Types ──────────────────────────────────────────────────────

export interface OpportunityItem {
    source: 'reddit' | 'discord' | 'quora';
    source_id: string;
    source_url: string;
    title: string;
    content: string;
    author: string;
    created_at_source: string;
    engagement: { score?: number; comments?: number; upvotes?: number };
    raw: Record<string, unknown>;
}

export type OpportunityStatus = 'new' | 'pending' | 'approved' | 'rejected' | 'posted' | 'ignored';

export interface OpportunityRow {
    id: string;
    source: string;
    source_id: string;
    source_url: string;
    title: string;
    content: string;
    author: string;
    created_at_source: string;
    collected_at: string;
    raw_json: string;
    status: OpportunityStatus;
}

// ─── Classification ─────────────────────────────────────────────────

export interface ClassificationResult {
    is_real_estate_intent: boolean;
    intent_confidence: number;
    intent_type: 'rent' | 'buy' | 'lease' | 'pg' | 'office' | 'investment' | 'general' | 'none';
    locations: Array<{ name: string; type: 'city' | 'locality' | 'sector' | 'landmark' }>;
    budget_range: 'unknown' | '<20k' | '20-40k' | '40-70k' | '70k+';
    timeline: 'immediate' | 'weeks' | 'months' | 'unknown';
    needs: string[];
    disallowed: boolean;
    reasoning_brief: string;
}

export interface ClassificationRow {
    opportunity_id: string;
    is_real_estate_intent: number;
    intent_confidence: number;
    intent_type: string;
    locations_json: string;
    budget_range: string;
    timeline: string;
    needs_json: string;
    disallowed: number;
    reasoning_brief: string;
    created_at: string;
}

// ─── Drafts ─────────────────────────────────────────────────────────

export interface DraftResult {
    variant_short: string;
    variant_detailed: string;
    variant_no_link: string;
    suggested_followup_questions: string[];
    safe_cta_link: string | null;
}

export interface DraftRow {
    opportunity_id: string;
    variant_short: string;
    variant_detailed: string;
    variant_no_link: string;
    followup_questions_json: string;
    safe_cta_link: string | null;
    created_at: string;
}

// ─── Scoring ────────────────────────────────────────────────────────

export interface ScoreBreakdown {
    intent_score: number;
    freshness_score: number;
    engagement_score: number;
    source_score: number;
    keyword_score: number;
    total: number;
}

export interface ScoringRow {
    opportunity_id: string;
    score: number;
    breakdown_json: string;
    created_at: string;
}

// ─── Approvals ──────────────────────────────────────────────────────

export interface ApprovalRow {
    opportunity_id: string;
    edited_reply: string | null;
    approved_reply: string;
    approved_by: string;
    approved_at: string;
    rejected_reason: string | null;
}

// ─── Events ─────────────────────────────────────────────────────────

export interface EventRow {
    id: string;
    type: 'click' | 'conversion';
    opportunity_id: string | null;
    url: string;
    meta_json: string;
    created_at: string;
}

// ─── LLM Provider ───────────────────────────────────────────────────

export interface LlmProvider {
    classify(opportunity: OpportunityItem, config: AppConfig): Promise<ClassificationResult>;
    generateReplies(opportunity: OpportunityItem, classification: ClassificationResult, config: AppConfig): Promise<DraftResult>;
}

// ─── Configuration ──────────────────────────────────────────────────

export interface AppConfig {
    include_keywords: string[];
    exclude_keywords: string[];
    locations: Record<string, string[]>;
    reddit: {
        enabled: boolean;
        subreddits: string[];
        search_queries: string[];
        poll_interval_minutes: number;
    };
    discord: {
        enabled: boolean;
        bot_token: string;
        allowed_guild_ids: string[];
        allowed_channel_ids: string[];
    };
    quora: {
        enabled: boolean;
        manual_submission_enabled: boolean;
    };
    scoring: {
        weights: {
            intent: number;
            freshness: number;
            engagement: number;
            source: number;
            keyword: number;
        };
        threshold: number;
        source_weights: Record<string, number>;
    };
    notifications: {
        slack_webhook_url: string;
        smtp: {
            host: string;
            port: number;
            user: string;
            pass: string;
            from: string;
        };
        email_to: string;
    };
    brand: {
        company_name: string;
        base_landing_url: string;
        supported_areas: string[];
        tone: string;
        forbidden_claims: string[];
    };
    do_not_engage: {
        subreddits: string[];
        channels: string[];
        keywords: string[];
    };
}
