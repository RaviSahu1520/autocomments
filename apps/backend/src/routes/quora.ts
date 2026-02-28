import type { FastifyInstance } from 'fastify';
import { createQuoraOpportunity } from '../collectors/quora.js';
import { processOpportunity } from '../pipeline/processor.js';
import { layout, escapeHtml } from '../utils/html.js';

export async function quoraRoutes(app: FastifyInstance): Promise<void> {

    // Manual submission form
    app.get('/quora/submit', async (_req, reply) => {
        const html = `
      <div class="page-header">
        <h1>Submit Quora Link</h1>
        <p class="subtitle">Paste a Quora question URL and optionally copy the text content.</p>
      </div>
      <div class="card" style="max-width:700px">
        <form method="POST" action="/quora/submit">
          <div class="form-group">
            <label for="url">Quora URL *</label>
            <input type="url" name="url" id="url" placeholder="https://www.quora.com/..." required>
          </div>
          <div class="form-group">
            <label for="text_snippet">Question Text (optional — paste the question text if available)</label>
            <textarea name="text_snippet" id="text_snippet" rows="5" placeholder="Paste the question text here..."></textarea>
          </div>
          <button type="submit" class="btn btn-primary">Submit & Process</button>
        </form>
      </div>
    `;
        reply.type('text/html').send(layout('Submit Quora Link', html));
    });

    // Handle submission
    app.post('/quora/submit', async (req, reply) => {
        const body = req.body as { url?: string; text_snippet?: string };

        if (!body.url) {
            const html = `
        <div class="card" style="max-width:700px">
          <div class="alert alert-danger">URL is required</div>
          <a href="/quora/submit" class="btn btn-outline">← Back</a>
        </div>`;
            reply.type('text/html').send(layout('Error', html));
            return;
        }

        try {
            const item = createQuoraOpportunity(body.url, body.text_snippet || '');
            const result = await processOpportunity(item);

            if (result.status === 'duplicate') {
                const html = `
          <div class="card" style="max-width:700px">
            <div class="alert alert-warning">This URL has already been submitted.</div>
            <a href="/quora/submit" class="btn btn-outline">← Submit Another</a>
          </div>`;
                reply.type('text/html').send(layout('Duplicate', html));
                return;
            }

            reply.redirect(`/opportunity/${result.id}`);
        } catch (err) {
            console.error('[Quora] Submission error:', err);
            const html = `
        <div class="card" style="max-width:700px">
          <div class="alert alert-danger">Error processing submission: ${escapeHtml(String(err))}</div>
          <a href="/quora/submit" class="btn btn-outline">← Try Again</a>
        </div>`;
            reply.type('text/html').send(layout('Error', html));
        }
    });
}
