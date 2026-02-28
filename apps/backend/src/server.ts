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
import { authRoutes } from './routes/auth.js';
import { opportunityRoutes } from './routes/opportunities.js';
import { quoraRoutes } from './routes/quora.js';
import { configRoutes } from './routes/config.js';
import { trackingRoutes } from './routes/tracking.js';
import { reportRoutes } from './routes/reports.js';
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

    // Validate LLM configuration
    const llmProvider = process.env.LLM_PROVIDER || 'openai';
    if (llmProvider === 'mock') {
        console.warn('⚠️  WARNING: LLM_PROVIDER is set to "mock" — responses will be synthetic, not real AI-generated.');
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

    // Register routes
    await app.register(authRoutes);
    await app.register(opportunityRoutes);
    await app.register(quoraRoutes);
    await app.register(configRoutes);
    await app.register(trackingRoutes);
    await app.register(reportRoutes);

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
    console.log(`   Admin password: ${process.env.ADMIN_PASSWORD || 'admin'}`);
    console.log(`   Reddit polling: ${config.reddit.enabled ? `every ${config.reddit.poll_interval_minutes}m` : 'disabled'}`);
    console.log(`   Reddit subreddits: ${config.reddit.subreddits.join(', ')}`);
    console.log(`   LLM provider: ${llmProvider}`);
    console.log(`\n   Open http://localhost:${port}/login to get started\n`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
