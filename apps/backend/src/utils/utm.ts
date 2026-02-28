import type { AppConfig } from '../types.js';

/**
 * Generate a UTM-tracked URL.
 */
export function generateUtmUrl(
    baseUrl: string,
    params: {
        source: string;
        medium: string;
        campaign: string;
        content?: string;
    }
): string {
    const url = new URL(baseUrl);
    url.searchParams.set('utm_source', params.source);
    url.searchParams.set('utm_medium', params.medium);
    url.searchParams.set('utm_campaign', params.campaign);
    if (params.content) {
        url.searchParams.set('utm_content', params.content);
    }
    return url.toString();
}

/**
 * Generate a tracking redirect URL via our /t endpoint.
 */
export function generateTrackingUrl(
    serverBaseUrl: string,
    targetUrl: string,
    params: {
        source: string;
        campaign: string;
        opportunityId?: string;
    }
): string {
    const url = new URL('/t', serverBaseUrl);
    url.searchParams.set('to', targetUrl);
    url.searchParams.set('source', params.source);
    url.searchParams.set('campaign', params.campaign);
    if (params.opportunityId) {
        url.searchParams.set('opp', params.opportunityId);
    }
    return url.toString();
}

/**
 * Get the medium string for a given source.
 */
export function getMediumForSource(source: string): string {
    switch (source) {
        case 'reddit': return 'comment';
        case 'quora': return 'answer';
        case 'discord': return 'message';
        default: return 'referral';
    }
}
