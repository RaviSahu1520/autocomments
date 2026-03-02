import type { OpportunityItem, ClassificationResult, DraftResult, AppConfig, LlmProvider } from '../types.js';
import { generateTrackingUrl, generateUtmUrl, getMediumForSource } from '../utils/utm.js';

const CLASSIFIER_SYSTEM_PROMPT = `You are a real-estate intent classifier for the Indian market. Analyze online posts/messages to determine if they relate to real estate.

You MUST output ONLY valid JSON matching this exact schema:
{
  "is_real_estate_intent": boolean,
  "intent_confidence": number (0.0 to 1.0),
  "intent_type": "rent"|"buy"|"lease"|"pg"|"office"|"investment"|"general"|"none",
  "locations": [{"name": string, "type": "city"|"locality"|"sector"|"landmark"}],
  "budget_range": "unknown"|"<20k"|"20-40k"|"40-70k"|"70k+",
  "timeline": "immediate"|"weeks"|"months"|"unknown",
  "needs": string[],
  "disallowed": boolean,
  "reasoning_brief": string
}

Rules:
- Only extract locations ACTUALLY mentioned. Do NOT hallucinate locations.
- Set disallowed=true if content is inflammatory, hateful, or involves illegal activity.
- Be conservative with intent_confidence: only high if clearly asking about real estate.
- needs should list specific requirements mentioned (e.g., "parking", "gym", "near metro").`;

function buildDraftSystemPrompt(config: AppConfig): string {
    const languageMode = config.brand.use_hinglish
        ? 'Use Hinglish (Roman Hindi + English mix) naturally in all reply variants.'
        : 'Use plain conversational English unless the source text itself is clearly Hinglish.';

    return `You are a helpful real-estate community reply assistant for ${config.brand.company_name}.

Generate 3 reply variants for a community post about real estate. Follow these COMMUNITY SAFE REPLY RULES strictly:
1. Be helpful FIRST. Don't sound like an ad.
2. NO exaggerated claims. Never say: ${config.brand.forbidden_claims.join(', ')}.
3. Maximum 1 link, only if context-appropriate.
4. If the community forbids self-promo, the no-link version must have zero promotional content.
5. Don't invent facts. If you don't know, say so or ask a clarifying question.
6. Use a human, conversational tone. Vary your style. Not repetitive or robotic.
7. DM mention only if the platform allows it.
8. ${languageMode}

Brand tone: ${config.brand.tone}
Supported areas: ${config.brand.supported_areas.join(', ')}

You MUST output ONLY valid JSON matching this schema:
{
  "variant_short": string (2-3 sentences, concise helpful answer),
  "variant_detailed": string (detailed helpful answer with specifics, may include 1 link if appropriate),
  "variant_no_link": string (helpful answer with NO links, NO brand mentions, pure value),
  "suggested_followup_questions": string[] (max 2 questions to help the person further),
  "safe_cta_link": string|null (tracked URL only if relevant and allowed, null otherwise)
}`;
}

export class OpenAIProvider implements LlmProvider {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor() {
        this.apiKey = process.env.LLM_API_KEY || '';
        this.baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
        this.model = process.env.LLM_MODEL || 'gpt-4o-mini';
    }

    async classify(opportunity: OpportunityItem, config: AppConfig): Promise<ClassificationResult> {
        const userMsg = `Classify this ${opportunity.source} post:
Title: ${opportunity.title || '(no title)'}
Content: ${opportunity.content}
Author: ${opportunity.author}
Source: ${opportunity.source}`;

        const result = await this.chatCompletion(CLASSIFIER_SYSTEM_PROMPT, userMsg);
        return this.parseJson<ClassificationResult>(result, 'classification');
    }

    async generateReplies(opportunity: OpportunityItem, classification: ClassificationResult, config: AppConfig, opportunityId?: string): Promise<DraftResult> {
        const systemPrompt = buildDraftSystemPrompt(config);

        const ctaBase = (config.brand.base_landing_url || '').trim().replace(/\/$/, '');
        const cityRaw = classification.locations[0]?.name || 'general';
        const cityCampaign = cityRaw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';

        let suggestedLink = '';
        if (ctaBase) {
            const landingUrl = `${ctaBase}/landing/${encodeURIComponent(cityCampaign)}`;
            try {
                const utmUrl = generateUtmUrl(landingUrl, {
                    source: opportunity.source,
                    medium: getMediumForSource(opportunity.source),
                    campaign: cityCampaign,
                });
                const appBaseUrl = (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || '3000'}`).trim();
                suggestedLink = generateTrackingUrl(appBaseUrl, utmUrl, {
                    source: opportunity.source,
                    campaign: cityCampaign,
                    opportunityId,
                });
            } catch {
                suggestedLink = landingUrl;
            }
        }

        const linkInstruction = suggestedLink
            ? `If a link is appropriate, use this tracked URL: ${suggestedLink}`
            : 'No tracked link is configured. Prefer no-link helpful replies.';

        const userMsg = `Generate reply variants for this ${opportunity.source} post:

Title: ${opportunity.title || '(no title)'}
Content: ${opportunity.content}
Author: ${opportunity.author}

Classification:
- Intent: ${classification.intent_type}
- Locations: ${classification.locations.map(l => l.name).join(', ') || 'not specified'}
- Budget: ${classification.budget_range}
- Timeline: ${classification.timeline}
- Needs: ${classification.needs.join(', ') || 'none specified'}

${linkInstruction}
Source platform: ${opportunity.source}`;

        const result = await this.chatCompletion(systemPrompt, userMsg);
        return this.parseJson<DraftResult>(result, 'drafts');
    }

    private async chatCompletion(systemPrompt: string, userMessage: string, retry = false): Promise<string> {
        if (!this.apiKey) {
            throw new Error('LLM_API_KEY is not set. Please set it in .env file.');
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ];

        if (retry) {
            messages.push({ role: 'user', content: 'Your previous response was not valid JSON. You MUST output ONLY valid JSON. No markdown, no explanation, just the JSON object.' });
        }

        const maxRetries = 3;
        const baseDelay = 5000; // 5 seconds

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const res = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    temperature: 0.2,
                    max_tokens: 1500,
                }),
            });

            if (res.status === 429 && attempt < maxRetries) {
                const waitTime = baseDelay * Math.pow(2, attempt); // 5s, 10s, 20s
                console.warn(`[LLM] Rate limited (429). Retrying in ${waitTime / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`LLM API error ${res.status}: ${errorText}`);
            }

            const data = await res.json() as {
                choices: Array<{ message: { content: string } }>;
            };

            return data.choices[0]?.message?.content || '';
        }

        throw new Error('LLM API: max retries exceeded due to rate limiting');
    }

    private parseJson<T>(raw: string, context: string): T {
        // Try to extract JSON from possible markdown code blocks
        let cleaned = raw.trim();
        const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            cleaned = jsonMatch[1].trim();
        }

        try {
            return JSON.parse(cleaned) as T;
        } catch (e) {
            console.error(`[LLM] Failed to parse ${context} JSON:`, cleaned.substring(0, 200));
            throw new Error(`Invalid JSON from LLM for ${context}: ${(e as Error).message}`);
        }
    }
}
