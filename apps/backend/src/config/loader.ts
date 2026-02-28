import { ConfigRepo } from '../db/repositories.js';
import { defaultConfig } from './defaults.js';
import type { AppConfig } from '../types.js';
import dotenv from 'dotenv';

dotenv.config();

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
    if (cachedConfig) return cachedConfig;

    // Load from DB first
    let dbConfig = ConfigRepo.get();

    if (!dbConfig) {
        // Initialize DB with defaults + env overrides
        dbConfig = applyEnvOverrides({ ...defaultConfig });
        ConfigRepo.set(dbConfig);
    }

    cachedConfig = dbConfig;
    return cachedConfig;
}

export function reloadConfig(): AppConfig {
    cachedConfig = null;
    return loadConfig();
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
    const current = loadConfig();
    const updated = deepMerge(current as any, partial as any) as AppConfig;
    ConfigRepo.set(updated);
    cachedConfig = updated;
    return updated;
}

function applyEnvOverrides(config: AppConfig): AppConfig {
    const env = process.env;

    if (env.SUBREDDITS) {
        config.reddit.subreddits = env.SUBREDDITS.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (env.SEARCH_QUERIES) {
        config.reddit.search_queries = env.SEARCH_QUERIES.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (env.REDDIT_POLL_INTERVAL) {
        config.reddit.poll_interval_minutes = parseInt(env.REDDIT_POLL_INTERVAL, 10) || 5;
    }
    if (env.REDDIT_ENABLED !== undefined) {
        config.reddit.enabled = env.REDDIT_ENABLED === 'true';
    }
    if (env.DISCORD_TOKEN) {
        config.discord.bot_token = env.DISCORD_TOKEN;
    }
    if (env.DISCORD_ENABLED !== undefined) {
        config.discord.enabled = env.DISCORD_ENABLED === 'true';
    }
    if (env.SLACK_WEBHOOK_URL) {
        config.notifications.slack_webhook_url = env.SLACK_WEBHOOK_URL;
    }
    if (env.SMTP_HOST) config.notifications.smtp.host = env.SMTP_HOST;
    if (env.SMTP_PORT) config.notifications.smtp.port = parseInt(env.SMTP_PORT, 10);
    if (env.SMTP_USER) config.notifications.smtp.user = env.SMTP_USER;
    if (env.SMTP_PASS) config.notifications.smtp.pass = env.SMTP_PASS;
    if (env.SMTP_FROM) config.notifications.smtp.from = env.SMTP_FROM;
    if (env.NOTIFICATION_EMAIL_TO) config.notifications.email_to = env.NOTIFICATION_EMAIL_TO;
    if (env.COMPANY_NAME) config.brand.company_name = env.COMPANY_NAME;
    if (env.BASE_LANDING_URL) config.brand.base_landing_url = env.BASE_LANDING_URL;

    return config;
}

function deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (
            source[key] &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === 'object' &&
            !Array.isArray(target[key])
        ) {
            result[key] = deepMerge(target[key], source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}
