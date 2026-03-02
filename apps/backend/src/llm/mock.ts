import type { OpportunityItem, ClassificationResult, DraftResult, AppConfig, LlmProvider } from '../types.js';

export class MockProvider implements LlmProvider {
    async classify(opportunity: OpportunityItem, _config: AppConfig): Promise<ClassificationResult> {
        const content = (opportunity.title + ' ' + opportunity.content).toLowerCase();
        const hasRealEstate = /\b(rent|buy|flat|apartment|bhk|pg|property|house|villa|lease|office space)\b/i.test(content);

        return {
            is_real_estate_intent: hasRealEstate,
            intent_confidence: hasRealEstate ? 0.85 : 0.1,
            intent_type: hasRealEstate ? 'rent' : 'none',
            locations: [],
            budget_range: 'unknown',
            timeline: 'unknown',
            needs: [],
            disallowed: false,
            reasoning_brief: hasRealEstate
                ? 'Mock: content contains real-estate keywords'
                : 'Mock: no real-estate keywords found',
        };
    }

    async generateReplies(opportunity: OpportunityItem, classification: ClassificationResult, config: AppConfig, _opportunityId?: string): Promise<DraftResult> {
        const city = classification.locations[0]?.name || 'your city';
        return {
            variant_short: `Great question! For ${classification.intent_type} options in ${city}, I'd recommend checking local listings and talking to verified agents. Happy to help with any specifics!`,
            variant_detailed: `Thanks for posting! Looking for ${classification.intent_type} options in ${city} is exciting. Here are a few tips:\n\n1. Check verified listings on major portals\n2. Visit the area at different times of day\n3. Verify RERA registration\n\nFeel free to ask if you need more specific guidance. You might also find helpful info at ${config.brand.base_landing_url}/landing/${encodeURIComponent(city.toLowerCase())}`,
            variant_no_link: `Thanks for asking! Here are some tips for finding ${classification.intent_type} options in ${city}:\n\n1. Check verified listings on major portals\n2. Visit the area at different times of day\n3. Always verify RERA registration\n\nHappy to help with more specifics!`,
            suggested_followup_questions: [
                'What is your preferred budget range?',
                'Are you looking for any specific amenities?',
            ],
            safe_cta_link: `${config.brand.base_landing_url}/landing/${encodeURIComponent(city.toLowerCase())}`,
        };
    }
}
