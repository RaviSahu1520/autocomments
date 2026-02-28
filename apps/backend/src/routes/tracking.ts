import type { FastifyInstance } from 'fastify';
import { EventRepo } from '../db/repositories.js';

export async function trackingRoutes(app: FastifyInstance): Promise<void> {

    // Tracking redirect
    app.get('/t', async (req, reply) => {
        const query = req.query as {
            to?: string;
            source?: string;
            campaign?: string;
            opp?: string;
        };

        const targetUrl = query.to;
        if (!targetUrl) {
            reply.code(400).send('Missing "to" parameter');
            return;
        }

        // Log click event
        EventRepo.create({
            type: 'click',
            opportunity_id: query.opp || null,
            url: targetUrl,
            meta: {
                source: query.source || 'unknown',
                campaign: query.campaign || '',
                referrer: req.headers.referer || '',
                user_agent: req.headers['user-agent'] || '',
                timestamp: new Date().toISOString(),
            },
        });

        // Redirect
        reply.code(302).redirect(targetUrl);
    });

    // Conversion event endpoint
    app.post('/api/events/conversion', async (req, reply) => {
        const body = req.body as {
            opportunity_id?: string;
            url?: string;
            meta?: Record<string, unknown>;
        };

        const id = EventRepo.create({
            type: 'conversion',
            opportunity_id: body.opportunity_id || null,
            url: body.url || '',
            meta: body.meta || {},
        });

        reply.send({ id, status: 'recorded' });
    });
}
