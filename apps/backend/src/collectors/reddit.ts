import { loadConfig } from '../config/loader.js';
import { OpportunityRepo } from '../db/repositories.js';
import type { OpportunityItem } from '../types.js';
import cron from 'node-cron';

const USER_AGENT = 'AutoCommentsBot/1.0 (Community Lead Capture Tool)';
const REDDIT_BASE = 'https://www.reddit.com';

interface RedditPost {
    kind: string;
    data: {
        id: string;
        name: string;
        title: string;
        selftext: string;
        author: string;
        permalink: string;
        created_utc: number;
        score: number;
        num_comments: number;
        subreddit: string;
        url: string;
        is_self: boolean;
        link_flair_text?: string;
    };
}

interface RedditListing {
    kind: string;
    data: {
        children: RedditPost[];
        after: string | null;
    };
}

let cronJob: cron.ScheduledTask | null = null;
let isRunning = false;

export async function fetchSubredditNew(subreddit: string, limit = 25): Promise<OpportunityItem[]> {
    const url = `${REDDIT_BASE}/r/${subreddit}/new.json?limit=${limit}&raw_json=1`;
    return fetchRedditListing(url, subreddit);
}

export async function fetchRedditSearch(query: string, limit = 25): Promise<OpportunityItem[]> {
    const url = `${REDDIT_BASE}/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${limit}&raw_json=1`;
    return fetchRedditListing(url, 'search');
}

async function fetchRedditListing(url: string, context: string): Promise<OpportunityItem[]> {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
            },
        });

        if (res.status === 429) {
            console.warn(`[Reddit] Rate limited fetching ${context}. Will retry next cycle.`);
            return [];
        }

        if (!res.ok) {
            console.error(`[Reddit] HTTP ${res.status} fetching ${context}: ${url}`);
            return [];
        }

        const data = await res.json() as RedditListing;
        const items: OpportunityItem[] = [];

        for (const child of data.data.children) {
            if (child.kind !== 't3') continue;
            const post = child.data;

            items.push({
                source: 'reddit',
                source_id: post.id,
                source_url: `https://www.reddit.com${post.permalink}`,
                title: post.title || '',
                content: post.selftext || '',
                author: post.author || '[deleted]',
                created_at_source: new Date(post.created_utc * 1000).toISOString(),
                engagement: {
                    score: post.score,
                    comments: post.num_comments,
                    upvotes: post.score,
                },
                raw: post as unknown as Record<string, unknown>,
            });
        }

        return items;
    } catch (err) {
        console.error(`[Reddit] Error fetching ${context}:`, err);
        return [];
    }
}

export async function runRedditCollection(): Promise<OpportunityItem[]> {
    if (isRunning) {
        console.log('[Reddit] Collection already in progress, skipping.');
        return [];
    }
    isRunning = true;
    const collected: OpportunityItem[] = [];

    try {
        const config = loadConfig();
        if (!config.reddit.enabled) {
            console.log('[Reddit] Collection disabled.');
            return [];
        }

        console.log('[Reddit] Starting collection cycle...');

        // Fetch subreddits
        for (const sub of config.reddit.subreddits) {
            // Check do-not-engage
            if (config.do_not_engage.subreddits.includes(sub.toLowerCase())) {
                console.log(`[Reddit] Skipping do-not-engage subreddit: ${sub}`);
                continue;
            }

            const items = await fetchSubredditNew(sub);
            let newCount = 0;
            for (const item of items) {
                if (!OpportunityRepo.exists('reddit', item.source_id)) {
                    collected.push(item);
                    newCount++;
                }
            }
            console.log(`[Reddit] r/${sub}: ${items.length} fetched, ${newCount} new`);

            // Polite rate limiting between subreddits
            await delay(1500);
        }

        // Fetch search queries
        for (const query of config.reddit.search_queries) {
            const items = await fetchRedditSearch(query);
            let newCount = 0;
            for (const item of items) {
                if (!OpportunityRepo.exists('reddit', item.source_id)) {
                    collected.push(item);
                    newCount++;
                }
            }
            console.log(`[Reddit] Search "${query}": ${items.length} fetched, ${newCount} new`);
            await delay(1500);
        }

        // De-duplicate the collected batch itself (same post may appear in multiple queries)
        const unique = new Map<string, OpportunityItem>();
        for (const item of collected) {
            unique.set(item.source_id, item);
        }

        console.log(`[Reddit] Collection complete. ${unique.size} new unique items.`);
        return Array.from(unique.values());
    } catch (err) {
        console.error('[Reddit] Collection error:', err);
        return [];
    } finally {
        isRunning = false;
    }
}

export function startRedditSchedule(): void {
    const config = loadConfig();
    if (!config.reddit.enabled) {
        console.log('[Reddit] Disabled, not scheduling.');
        return;
    }

    const minutes = config.reddit.poll_interval_minutes;
    const cronExpr = `*/${minutes} * * * *`;

    console.log(`[Reddit] Scheduling collection every ${minutes} minutes.`);

    // Run immediately on start
    setTimeout(() => {
        console.log('[Reddit] Running initial collection...');
        runRedditCollection().catch(err => console.error('[Reddit] Initial collection error:', err));
    }, 5000);

    cronJob = cron.schedule(cronExpr, () => {
        runRedditCollection().catch(err => console.error('[Reddit] Scheduled collection error:', err));
    });
}

export function stopRedditSchedule(): void {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
