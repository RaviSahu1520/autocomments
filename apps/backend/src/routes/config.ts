import type { FastifyInstance } from 'fastify';
import { loadConfig, updateConfig } from '../config/loader.js';
import { layout, escapeHtml } from '../utils/html.js';

export async function configRoutes(app: FastifyInstance): Promise<void> {
    // Config editor
    app.get('/config', async (_req, reply) => {
        const config = loadConfig();
        const configJson = JSON.stringify(config, null, 2);
        const useHinglish = config.brand.use_hinglish ? 'checked' : '';
        const hinglishLabel = config.brand.use_hinglish ? 'Enabled' : 'Disabled';

        const html = `
      <div class="page-header">
        <h1>Configuration</h1>
        <p class="subtitle">Edit system configuration. Changes are saved to the database.</p>
      </div>
      <div class="card" style="max-width:700px">
        <h3>Reply Language</h3>
        <p class="text-muted">Hinglish mode is currently <strong>${hinglishLabel}</strong>.</p>
        <form method="POST" action="/config/hinglish" class="action-form">
          <label style="display:flex; align-items:center; gap:0.5rem;">
            <input type="checkbox" name="enabled" value="true" ${useHinglish}>
            Use Hinglish for generated reply drafts
          </label>
          <button type="submit" class="btn btn-primary">Save Language Preference</button>
        </form>
      </div>
      <div class="card">
        <form method="POST" action="/config">
          <div class="form-group">
            <label for="config_json">Configuration JSON</label>
            <textarea name="config_json" id="config_json" rows="30" class="code-editor">${escapeHtml(configJson)}</textarea>
          </div>
          <div class="btn-group">
            <button type="submit" class="btn btn-primary">Save Configuration</button>
            <a href="/config" class="btn btn-outline">Reset</a>
          </div>
        </form>
      </div>
    `;
        reply.type('text/html').send(layout('Configuration', html));
    });

    // Save config
    app.post('/config', async (req, reply) => {
        const body = req.body as { config_json?: string };

        if (!body.config_json) {
            reply.redirect('/config');
            return;
        }

        try {
            const parsed = JSON.parse(body.config_json);
            updateConfig(parsed);
            const html = `
        <div class="page-header">
          <h1>Configuration</h1>
        </div>
        <div class="alert alert-success">Configuration saved successfully.</div>
        <a href="/config" class="btn btn-outline">Back to Config</a>
      `;
            reply.type('text/html').send(layout('Config Saved', html));
        } catch (err) {
            const html = `
        <div class="page-header">
          <h1>Configuration</h1>
        </div>
        <div class="alert alert-danger">Invalid JSON: ${escapeHtml(String(err))}</div>
        <a href="/config" class="btn btn-outline">Back to Config</a>
      `;
            reply.type('text/html').send(layout('Config Error', html));
        }
    });

    // Quick toggle for Hinglish replies
    app.post('/config/hinglish', async (req, reply) => {
        const body = req.body as { enabled?: string };
        const enabled = body.enabled === 'true' || body.enabled === 'on';

        updateConfig({
            brand: {
                use_hinglish: enabled,
            } as any,
        });

        reply.redirect('/config');
    });

    // API endpoint for config
    app.get('/api/config', async (_req, reply) => {
        reply.send(loadConfig());
    });

    app.put('/api/config', async (req, reply) => {
        try {
            const updated = updateConfig(req.body as any);
            reply.send(updated);
        } catch (err) {
            reply.status(400).send({ error: String(err) });
        }
    });
}
