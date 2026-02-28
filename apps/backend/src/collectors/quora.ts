import type { OpportunityItem } from '../types.js';

/**
 * Creates an OpportunityItem from a manually submitted Quora link.
 * No scraping — user provides the URL and optionally the text content.
 */
export function createQuoraOpportunity(url: string, textSnippet: string, submittedBy: string = 'admin'): OpportunityItem {
    // Create a stable ID from the URL
    const sourceId = Buffer.from(url).toString('base64url').substring(0, 64);

    return {
        source: 'quora',
        source_id: sourceId,
        source_url: url,
        title: extractTitleFromUrl(url),
        content: textSnippet || '(content submitted via manual link)',
        author: submittedBy,
        created_at_source: new Date().toISOString(),
        engagement: {},
        raw: { url, textSnippet, submittedBy, manual: true },
    };
}

function extractTitleFromUrl(url: string): string {
    try {
        const u = new URL(url);
        // Quora URLs often contain the question in the path
        const parts = u.pathname.split('/').filter(Boolean);
        const questionPart = parts.find(p => p.length > 20) || parts[parts.length - 1] || '';
        return questionPart.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    } catch {
        return 'Quora Question';
    }
}
