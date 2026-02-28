import type { OpportunityItem, ClassificationResult, DraftResult, AppConfig, LlmProvider } from '../types.js';

export { LlmProvider };

export function createLlmProvider(): LlmProvider {
    const provider = process.env.LLM_PROVIDER || 'openai';
    switch (provider) {
        case 'mock':
            return new (require('./mock.js') as { MockProvider: new () => LlmProvider }).MockProvider();
        default:
            // Dynamic import would be cleaner but using lazy require pattern for simplicity
            const { OpenAIProvider } = require('./openai.js') as { OpenAIProvider: new () => LlmProvider };
            return new OpenAIProvider();
    }
}
