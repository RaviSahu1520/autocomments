import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyFormBody from '@fastify/formbody';
import fastifyCookie from '@fastify/cookie';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

import { getDb } from './db/database.js';
import { loadConfig } from './config/loader.js';
import { authRoutes, COOKIE_NAME, isSessionTokenValid } from './routes/auth.js';
import { opportunityRoutes } from './routes/opportunities.js';
import { quoraRoutes } from './routes/quora.js';
import { configRoutes } from './routes/config.js';
import { trackingRoutes } from './routes/tracking.js';
import { reportRoutes } from './routes/reports.js';
import { exportRoutes } from './routes/exports.js';
import { instagramRoutes } from './routes/instagram.js';
import { runRedditCollection } from './collectors/reddit.js';
import { processOpportunity, processBatch } from './pipeline/processor.js';
import type { OpportunityItem } from './types.js';
import cron from 'node-cron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
    // Initialize database
    getDb();
    console.log('✅ Database initialized');

    // Load config
    const config = loadConfig();
    console.log('✅ Configuration loaded');
    const isProduction = process.env.NODE_ENV === 'production';

    const adminPassword = process.env.ADMIN_PASSWORD || '';
    if (isProduction && (!adminPassword || adminPassword === 'admin')) {
        console.error('❌ ERROR: ADMIN_PASSWORD must be set to a strong non-default value in production.');
        process.exit(1);
    }

    const appBaseUrl = (process.env.APP_BASE_URL || '').trim();
    if (isProduction && !appBaseUrl) {
        console.error('❌ ERROR: APP_BASE_URL must be configured in production for safe tracking links.');
        process.exit(1);
    }
    if (appBaseUrl && !isValidHttpUrl(appBaseUrl)) {
        console.error('❌ ERROR: APP_BASE_URL must be an absolute http/https URL.');
        process.exit(1);
    }

    // Validate LLM configuration
    const llmProvider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
    const allowMock = process.env.ALLOW_MOCK_LLM === 'true' || process.env.NODE_ENV === 'test';
    if (llmProvider === 'mock' && !allowMock) {
        console.error('❌ ERROR: LLM_PROVIDER=mock is disabled. Set ALLOW_MOCK_LLM=true only for controlled local testing.');
        process.exit(1);
    } else if (llmProvider === 'mock') {
        console.warn('⚠️  WARNING: Mock LLM enabled because ALLOW_MOCK_LLM=true.');
    } else if (!process.env.LLM_API_KEY) {
        console.error('❌ ERROR: LLM_API_KEY is not set but LLM_PROVIDER is "' + llmProvider + '". Real data fetching will fail!');
        console.error('   Please set LLM_API_KEY in your .env file.');
        process.exit(1);
    } else {
        console.log(`✅ Real LLM provider active (${llmProvider}, model: ${process.env.LLM_MODEL || 'default'})`);
    }

    // Validate email notification config
    if (config.notifications.smtp.host && config.notifications.smtp.user && config.notifications.email_to) {
        console.log(`✅ Email notifications configured (to: ${config.notifications.email_to})`);
    } else {
        console.warn('⚠️  Email notifications NOT configured. Fill in SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM, NOTIFICATION_EMAIL_TO in .env to enable.');
    }

    // Create Fastify server
    const app = Fastify({ logger: false });

    // Register plugins
    await app.register(fastifyFormBody);
    await app.register(fastifyCookie);
    await app.register(fastifyStatic, {
        root: path.join(__dirname, '../public'),
        prefix: '/',
    });

    // Global auth guard for all non-public routes.
    app.addHook('onRequest', async (req, reply) => {
        const pathOnly = req.url.split('?')[0];
        const publicPaths = ['/login', '/t', '/api/events/conversion', '/api/discord/opportunity', '/api/instagram/import'];
        const isPublic = publicPaths.some(p => pathOnly.startsWith(p));
        const isStatic = pathOnly.startsWith('/styles.css') || pathOnly.startsWith('/app.js') || pathOnly.startsWith('/favicon');

        if (isPublic || isStatic) return;

        const session = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
        if (!isSessionTokenValid(session)) {
            reply.clearCookie(COOKIE_NAME, { path: '/' });
            reply.redirect('/login');
            return reply;
        }
    });

    // Register routes
    await app.register(authRoutes);
    await app.register(opportunityRoutes);
    await app.register(quoraRoutes);
    await app.register(configRoutes);
    await app.register(trackingRoutes);
    await app.register(reportRoutes);
    await app.register(exportRoutes);
    await app.register(instagramRoutes);

    // Discord bot ingestion API (for the separate discord-bot process)
    app.post('/api/discord/opportunity', async (req, reply) => {
        try {
            const item = req.body as OpportunityItem;
            const result = await processOpportunity(item);
            reply.send(result);
        } catch (err) {
            console.error('[API] Discord opportunity error:', err);
            reply.status(500).send({ error: String(err) });
        }
    });

    // Reddit manual trigger
    app.post('/api/reddit/collect', async (_req, reply) => {
        try {
            const items = await runRedditCollection();
            await processBatch(items);
            reply.send({ collected: items.length });
        } catch (err) {
            reply.status(500).send({ error: String(err) });
        }
    });

    // Start Reddit collection + processing schedule
    if (config.reddit.enabled) {
        const minutes = config.reddit.poll_interval_minutes;
        console.log(`[Reddit] Scheduling collection + processing every ${minutes} minutes.`);

        // Collect and process function
        const collectAndProcess = async () => {
            try {
                const items = await runRedditCollection();
                if (items.length > 0) {
                    console.log(`[Pipeline] Processing ${items.length} Reddit items...`);
                    await processBatch(items);
                }
            } catch (err) {
                console.error('[Reddit] Collection/processing error:', err);
            }
        };

        // Run initial collection after a short delay
        setTimeout(collectAndProcess, 5000);

        // Schedule periodic collection
        cron.schedule(`*/${minutes} * * * *`, collectAndProcess);
    }

    // Start server
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`\n🚀 AutoComments server running at http://localhost:${port}`);
    console.log(`   Reddit polling: ${config.reddit.enabled ? `every ${config.reddit.poll_interval_minutes}m` : 'disabled'}`);
    console.log(`   Reddit subreddits: ${config.reddit.subreddits.join(', ')}`);
    console.log(`   LLM provider: ${llmProvider}`);
    console.log(`\n   Open http://localhost:${port}/login to get started\n`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

function isValidHttpUrl(rawUrl: string): boolean {
    try {
        const parsed = new URL(rawUrl);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}
