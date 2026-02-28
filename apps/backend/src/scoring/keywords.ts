import type { AppConfig } from '../types.js';

export interface KeywordMatchResult {
    includeMatches: string[];
    excludeMatches: string[];
    doNotEngageMatch: boolean;
    doNotEngageReason: string;
    shouldProcess: boolean;
    keywordScore: number; // 0-100
}

/**
 * Match content against include/exclude keywords and do-not-engage lists.
 */
export function matchKeywords(
    content: string,
    source: string,
    sourceContext: string, // subreddit name or channel id
    config: AppConfig
): KeywordMatchResult {
    const text = content.toLowerCase();
    const result: KeywordMatchResult = {
        includeMatches: [],
        excludeMatches: [],
        doNotEngageMatch: false,
        doNotEngageReason: '',
        shouldProcess: true,
        keywordScore: 0,
    };

    // Check do-not-engage lists
    const contextLower = sourceContext.toLowerCase();
    if (source === 'reddit' && config.do_not_engage.subreddits.some(s => s.toLowerCase() === contextLower)) {
        result.doNotEngageMatch = true;
        result.doNotEngageReason = `Subreddit r/${sourceContext} is in do-not-engage list`;
        result.shouldProcess = false;
        return result;
    }
    if (source === 'discord' && config.do_not_engage.channels.some(c => c === sourceContext)) {
        result.doNotEngageMatch = true;
        result.doNotEngageReason = `Channel ${sourceContext} is in do-not-engage list`;
        result.shouldProcess = false;
        return result;
    }

    // Check do-not-engage keywords
    for (const kw of config.do_not_engage.keywords) {
        if (text.includes(kw.toLowerCase())) {
            result.doNotEngageMatch = true;
            result.doNotEngageReason = `Contains do-not-engage keyword: "${kw}"`;
            result.shouldProcess = false;
            return result;
        }
    }

    // Check exclude keywords
    for (const kw of config.exclude_keywords) {
        if (text.includes(kw.toLowerCase())) {
            result.excludeMatches.push(kw);
        }
    }
    if (result.excludeMatches.length > 0) {
        result.shouldProcess = false;
        return result;
    }

    // Check include keywords
    for (const kw of config.include_keywords) {
        if (text.includes(kw.toLowerCase())) {
            result.includeMatches.push(kw);
        }
    }

    // Calculate keyword score (0-100) based on number of include matches
    if (result.includeMatches.length === 0) {
        result.keywordScore = 0;
    } else if (result.includeMatches.length === 1) {
        result.keywordScore = 40;
    } else if (result.includeMatches.length === 2) {
        result.keywordScore = 60;
    } else if (result.includeMatches.length === 3) {
        result.keywordScore = 75;
    } else {
        result.keywordScore = Math.min(100, 75 + result.includeMatches.length * 5);
    }

    // Check for location mentions (bonus)
    for (const [city, localities] of Object.entries(config.locations)) {
        if (text.includes(city.toLowerCase())) {
            result.keywordScore = Math.min(100, result.keywordScore + 10);
        }
        for (const loc of localities) {
            if (text.includes(loc.toLowerCase())) {
                result.keywordScore = Math.min(100, result.keywordScore + 5);
            }
        }
    }

    return result;
}
