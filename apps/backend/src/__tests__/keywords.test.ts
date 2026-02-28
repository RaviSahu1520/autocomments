import { describe, it, expect } from 'vitest';
import { matchKeywords } from '../scoring/keywords.js';
import { defaultConfig } from '../config/defaults.js';

describe('Keyword Matching', () => {
    it('should match include keywords', () => {
        const result = matchKeywords('Looking for 2BHK flat in Gurgaon', 'reddit', 'gurgaon', defaultConfig);
        expect(result.includeMatches).toContain('2bhk');
        expect(result.includeMatches).toContain('flat');
        expect(result.shouldProcess).toBe(true);
    });

    it('should flag exclude keywords', () => {
        const result = matchKeywords('This crypto meme is hilarious', 'reddit', 'india', defaultConfig);
        expect(result.excludeMatches.length).toBeGreaterThan(0);
        expect(result.shouldProcess).toBe(false);
    });

    it('should flag do-not-engage keywords', () => {
        const result = matchKeywords('This is about politics and religion', 'reddit', 'india', defaultConfig);
        expect(result.doNotEngageMatch).toBe(true);
        expect(result.shouldProcess).toBe(false);
    });

    it('should flag do-not-engage subreddits', () => {
        const config = {
            ...defaultConfig,
            do_not_engage: {
                ...defaultConfig.do_not_engage,
                subreddits: ['badsubreddit'],
            },
        };
        const result = matchKeywords('I want a flat', 'reddit', 'badsubreddit', config);
        expect(result.doNotEngageMatch).toBe(true);
        expect(result.shouldProcess).toBe(false);
    });

    it('should calculate keyword score based on match count', () => {
        const result1 = matchKeywords('flat', 'reddit', 'test', defaultConfig);
        const result2 = matchKeywords('2bhk flat rent gurugram', 'reddit', 'test', defaultConfig);
        expect(result2.keywordScore).toBeGreaterThan(result1.keywordScore);
    });

    it('should boost score for location mentions', () => {
        const noLocation = matchKeywords('I want a flat', 'reddit', 'test', defaultConfig);
        const withLocation = matchKeywords('I want a flat in gurugram sector 49', 'reddit', 'test', defaultConfig);
        expect(withLocation.keywordScore).toBeGreaterThan(noLocation.keywordScore);
    });

    it('should return zero keyword score when no keywords match', () => {
        const result = matchKeywords('something completely unrelated about cooking', 'reddit', 'test', defaultConfig);
        expect(result.keywordScore).toBe(0);
        expect(result.includeMatches).toHaveLength(0);
    });
});
