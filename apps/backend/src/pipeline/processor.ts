import type { OpportunityItem, ClassificationResult, AppConfig } from '../types.js';
import { OpportunityRepo, ClassificationRepo, ScoringRepo, DraftRepo } from '../db/repositories.js';
import { matchKeywords } from '../scoring/keywords.js';
import { calculateScore } from '../scoring/scorer.js';
import { loadConfig } from '../config/loader.js';
import { OpenAIProvider } from '../llm/openai.js';
import { MockProvider } from '../llm/mock.js';
import type { LlmProvider } from '../types.js';
import { sendNotification } from '../notifications/notify.js';

let llmProvider: LlmProvider | null = null;

function getLlmProvider(): LlmProvider {
    if (!llmProvider) {
        const providerType = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
        const allowMock = process.env.ALLOW_MOCK_LLM === 'true' || process.env.NODE_ENV === 'test';
        if (providerType === 'mock') {
            if (!allowMock) {
                throw new Error('LLM_PROVIDER=mock is disabled. Set ALLOW_MOCK_LLM=true only for controlled local testing.');
            }
            console.warn('[Pipeline] ⚠️  Using MOCK LLM provider because ALLOW_MOCK_LLM=true.');
            llmProvider = new MockProvider();
        } else {
            if (!process.env.LLM_API_KEY) {
                throw new Error('LLM_API_KEY is required when LLM_PROVIDER is not "mock". Set it in .env file.');
            }
            llmProvider = new OpenAIProvider();
        }
    }
    return llmProvider;
}

/**
 * Process a single OpportunityItem through the full pipeline:
 * 1. Store in DB
 * 2. Keyword filter
 * 3. AI classify
 * 4. Score
 * 5. Generate drafts (if above threshold)
 * 6. Update status
 */
export async function processOpportunity(item: OpportunityItem): Promise<{ id: string; status: string; score?: number }> {
    const config = loadConfig();

    // 1. Store in DB
    const id = OpportunityRepo.create({
        source: item.source,
        source_id: item.source_id,
        source_url: item.source_url,
        title: item.title,
        content: item.content,
        author: item.author,
        created_at_source: item.created_at_source,
        raw_json: JSON.stringify(item.raw),
    });

    if (!id) {
        return { id: '', status: 'duplicate' };
    }

    // 2. Keyword filter
    const text = `${item.title} ${item.content}`;
    const sourceContext = extractSourceContext(item);
    const keywordResult = matchKeywords(text, item.source, sourceContext, config);

    if (!keywordResult.shouldProcess) {
        OpportunityRepo.updateStatus(id, 'ignored');
        console.log(`[Pipeline] ${id} → ignored (${keywordResult.doNotEngageReason || 'exclude keyword match: ' + keywordResult.excludeMatches.join(', ')})`);
        return { id, status: 'ignored' };
    }

    try {
        // 3. AI Classification
        const provider = getLlmProvider();
        const classification = await provider.classify(item, config);
        ClassificationRepo.upsert(id, classification);

        // Check if disallowed or not real estate
        if (classification.disallowed || !classification.is_real_estate_intent) {
            OpportunityRepo.updateStatus(id, 'ignored');
            console.log(`[Pipeline] ${id} → ignored (${classification.disallowed ? 'disallowed' : 'not real estate'}: ${classification.reasoning_brief})`);
            return { id, status: 'ignored' };
        }

        // 4. Score
        const breakdown = calculateScore(item, classification, keywordResult.keywordScore, config);
        ScoringRepo.upsert(id, breakdown.total, breakdown);

        if (breakdown.total < config.scoring.threshold) {
            OpportunityRepo.updateStatus(id, 'ignored');
            console.log(`[Pipeline] ${id} → ignored (score ${breakdown.total} < threshold ${config.scoring.threshold})`);
            return { id, status: 'ignored', score: breakdown.total };
        }

        // 5. Generate drafts
        const drafts = await provider.generateReplies(item, classification, config, id);
        DraftRepo.upsert(id, drafts);

        // 6. Update status to pending
        OpportunityRepo.updateStatus(id, 'pending');
        console.log(`[Pipeline] ${id} → pending (score: ${breakdown.total})`);

        // 7. Send notification (non-blocking)
        sendNotification(id, item, breakdown.total, config).catch(err =>
            console.error('[Pipeline] Notification error:', err)
        );

        return { id, status: 'pending', score: breakdown.total };
    } catch (err) {
        console.error(`[Pipeline] Error processing ${id}:`, err);
        // Still keep the opportunity in 'new' status so it can be retried
        return { id, status: 'error' };
    }
}

/**
 * Process a batch of opportunities.
 */
export async function processBatch(items: OpportunityItem[]): Promise<void> {
    console.log(`[Pipeline] Processing batch of ${items.length} items...`);
    for (const item of items) {
        await processOpportunity(item);
        // Delay between LLM calls (2s) to respect provider rate limits.
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log(`[Pipeline] Batch complete.`);
}

function extractSourceContext(item: OpportunityItem): string {
    if (item.source === 'reddit') {
        // Extract subreddit from URL or raw data
        const raw = item.raw as Record<string, unknown>;
        return (raw.subreddit as string) || '';
    }
    if (item.source === 'discord') {
        const raw = item.raw as Record<string, unknown>;
        return (raw.channel_id as string) || '';
    }
    return '';
}
