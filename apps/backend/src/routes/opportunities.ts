import type { FastifyInstance } from 'fastify';
import { OpportunityRepo, ClassificationRepo, ScoringRepo, DraftRepo, ApprovalRepo, EventRepo } from '../db/repositories.js';
import { layout, badge, truncate, timeAgo, escapeHtml } from '../utils/html.js';

export async function opportunityRoutes(app: FastifyInstance): Promise<void> {

    // ─── Root redirect ─────────────────────────────────────────────
    app.get('/', async (_req, reply) => {
        reply.redirect('/opportunities?status=pending');
    });

    // ─── List view ─────────────────────────────────────────────────
    app.get('/opportunities', async (req, reply) => {
        const query = req.query as { status?: string; page?: string };
        const status = query.status || 'pending';
        const page = parseInt(query.page || '1', 10);
        const limit = 25;
        const offset = (page - 1) * limit;

        const items = OpportunityRepo.findAll(limit, offset, status);
        const counts = OpportunityRepo.countByStatus();
        const total = status === 'all' ? OpportunityRepo.countTotal() : (counts[status] || 0);
        const totalPages = Math.max(1, Math.ceil(total / limit));

        const statusTabs = ['pending', 'approved', 'posted', 'rejected', 'ignored', 'all'];

        let rows = '';
        for (const item of items) {
            const scoring = ScoringRepo.findByOpportunityId(item.id);
            const score = scoring?.score ?? '—';
            const classification = ClassificationRepo.findByOpportunityId(item.id);
            const intentType = classification?.intent_type ?? '—';
            const clicks = EventRepo.countByOpportunity(item.id, 'click');

            rows += `
        <tr class="opp-row" onclick="window.location='/opportunity/${item.id}'">
          <td>${badge(item.status)}</td>
          <td>
            <div class="opp-title">${escapeHtml(truncate(item.title || item.content, 80))}</div>
            <div class="opp-meta">${item.source} · ${item.author} · ${timeAgo(item.collected_at)}</div>
          </td>
          <td class="text-center"><span class="score-badge">${score}</span></td>
          <td class="text-center">${intentType}</td>
          <td class="text-center">${clicks > 0 ? clicks : '—'}</td>
          <td class="text-center">
            <a href="/opportunity/${item.id}" class="btn-sm btn-primary">View</a>
          </td>
        </tr>`;
        }

        const tabHtml = statusTabs.map(s => {
            const count = s === 'all' ? OpportunityRepo.countTotal() : (counts[s] || 0);
            const active = s === status ? 'active' : '';
            return `<a href="/opportunities?status=${s}" class="tab ${active}">${s} <span class="tab-count">${count}</span></a>`;
        }).join('');

        let paginationHtml = '';
        if (totalPages > 1) {
            const prevDisabled = page <= 1 ? 'disabled' : '';
            const nextDisabled = page >= totalPages ? 'disabled' : '';
            paginationHtml = `
        <div class="pagination">
          <a href="/opportunities?status=${status}&page=${page - 1}" class="btn-sm ${prevDisabled}">← Prev</a>
          <span>Page ${page} of ${totalPages}</span>
          <a href="/opportunities?status=${status}&page=${page + 1}" class="btn-sm ${nextDisabled}">Next →</a>
        </div>`;
        }

        const html = `
      <div class="page-header">
        <h1>Approval Queue</h1>
      </div>
      <div class="tabs">${tabHtml}</div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Content</th>
              <th class="text-center">Score</th>
              <th class="text-center">Intent</th>
              <th class="text-center">Clicks</th>
              <th class="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" class="empty-state">No items found</td></tr>'}
          </tbody>
        </table>
        ${paginationHtml}
      </div>
    `;

        reply.type('text/html').send(layout('Approval Queue', html));
    });

    // ─── Detail view ───────────────────────────────────────────────
    app.get('/opportunity/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const opp = OpportunityRepo.findById(id);
        if (!opp) {
            reply.code(404).type('text/html').send(layout('Not Found', '<h1>Opportunity not found</h1>'));
            return;
        }

        const classification = ClassificationRepo.findByOpportunityId(id);
        const scoring = ScoringRepo.findByOpportunityId(id);
        const draft = DraftRepo.findByOpportunityId(id);
        const approval = ApprovalRepo.findByOpportunityId(id);
        const clicks = EventRepo.countByOpportunity(id, 'click');
        const conversions = EventRepo.countByOpportunity(id, 'conversion');

        // Parse JSON fields safely
        const locations = classification ? safeJsonParse(classification.locations_json, []) : [];
        const needs = classification ? safeJsonParse(classification.needs_json, []) : [];
        const breakdown = scoring ? safeJsonParse(scoring.breakdown_json, {}) : {};
        const followups = draft ? safeJsonParse(draft.followup_questions_json, []) : [];

        const html = `
      <div class="page-header">
        <a href="/opportunities?status=${opp.status}" class="back-link">← Back to Queue</a>
        <div class="header-row">
          <h1>${escapeHtml(truncate(opp.title || 'Untitled', 100))}</h1>
          ${badge(opp.status)}
        </div>
      </div>

      <div class="detail-grid">
        <!-- Source Info -->
        <div class="card">
          <h3>📌 Source</h3>
          <div class="info-grid">
            <div><strong>Platform:</strong> ${opp.source}</div>
            <div><strong>Author:</strong> ${escapeHtml(opp.author)}</div>
            <div><strong>Collected:</strong> ${timeAgo(opp.collected_at)}</div>
            <div><strong>Clicks:</strong> ${clicks} · <strong>Conversions:</strong> ${conversions}</div>
          </div>
          <a href="${escapeHtml(opp.source_url)}" target="_blank" class="btn-sm btn-outline mt-2">View Original ↗</a>
        </div>

        <!-- Score -->
        <div class="card">
          <h3>📊 Score: <span class="score-large">${scoring?.score ?? '—'}</span>/100</h3>
          ${scoring ? `
          <div class="score-breakdown">
            <div class="score-bar"><label>Intent</label><div class="bar"><div class="bar-fill" style="width:${breakdown.intent_score || 0}%"></div></div><span>${breakdown.intent_score || 0}</span></div>
            <div class="score-bar"><label>Freshness</label><div class="bar"><div class="bar-fill bar-blue" style="width:${breakdown.freshness_score || 0}%"></div></div><span>${breakdown.freshness_score || 0}</span></div>
            <div class="score-bar"><label>Engagement</label><div class="bar"><div class="bar-fill bar-green" style="width:${breakdown.engagement_score || 0}%"></div></div><span>${breakdown.engagement_score || 0}</span></div>
            <div class="score-bar"><label>Source</label><div class="bar"><div class="bar-fill bar-purple" style="width:${breakdown.source_score || 0}%"></div></div><span>${breakdown.source_score || 0}</span></div>
            <div class="score-bar"><label>Keywords</label><div class="bar"><div class="bar-fill bar-orange" style="width:${breakdown.keyword_score || 0}%"></div></div><span>${breakdown.keyword_score || 0}</span></div>
          </div>` : '<p class="text-muted">Not scored yet</p>'}
        </div>

        <!-- Classification -->
        <div class="card">
          <h3>🧠 Classification</h3>
          ${classification ? `
          <div class="info-grid">
            <div><strong>Intent:</strong> ${classification.intent_type} (${Math.round(classification.intent_confidence * 100)}%)</div>
            <div><strong>Budget:</strong> ${classification.budget_range}</div>
            <div><strong>Timeline:</strong> ${classification.timeline}</div>
            <div><strong>Locations:</strong> ${locations.map((l: { name: string; type: string }) => `${l.name} (${l.type})`).join(', ') || 'None detected'}</div>
            <div><strong>Needs:</strong> ${needs.join(', ') || 'None specified'}</div>
          </div>
          <p class="text-muted mt-2"><em>${escapeHtml(classification.reasoning_brief)}</em></p>
          ` : '<p class="text-muted">Not classified yet</p>'}
        </div>

        <!-- Content -->
        <div class="card card-full">
          <h3>📝 Original Content</h3>
          <div class="content-box">${escapeHtml(opp.content || '(no content)')}</div>
        </div>

        <!-- Drafts -->
        ${draft ? `
        <div class="card card-full">
          <h3>✍️ Reply Drafts</h3>
          <div class="drafts-tabs">
            <button class="draft-tab active" data-target="draft-short">Short</button>
            <button class="draft-tab" data-target="draft-detailed">Detailed</button>
            <button class="draft-tab" data-target="draft-nolink">No Link</button>
          </div>

          <div id="draft-short" class="draft-panel active">
            <div class="draft-content">${escapeHtml(draft.variant_short)}</div>
            <button class="btn-sm btn-outline copy-btn" data-text="${escapeAttr(draft.variant_short)}">📋 Copy</button>
          </div>
          <div id="draft-detailed" class="draft-panel">
            <div class="draft-content">${escapeHtml(draft.variant_detailed)}</div>
            <button class="btn-sm btn-outline copy-btn" data-text="${escapeAttr(draft.variant_detailed)}">📋 Copy</button>
          </div>
          <div id="draft-nolink" class="draft-panel">
            <div class="draft-content">${escapeHtml(draft.variant_no_link)}</div>
            <button class="btn-sm btn-outline copy-btn" data-text="${escapeAttr(draft.variant_no_link)}">📋 Copy</button>
          </div>

          ${followups.length > 0 ? `
          <div class="mt-2">
            <strong>Suggested Follow-ups:</strong>
            <ul>${followups.map((q: string) => `<li>${escapeHtml(q)}</li>`).join('')}</ul>
          </div>` : ''}

          ${draft.safe_cta_link ? `<p class="mt-2"><strong>CTA Link:</strong> <a href="${escapeHtml(draft.safe_cta_link)}" target="_blank">${escapeHtml(draft.safe_cta_link)}</a></p>` : ''}
        </div>
        ` : ''}

        <!-- Actions -->
        ${renderActions(opp.status, id, draft, approval)}
      </div>
    `;

        reply.type('text/html').send(layout('Opportunity Detail', html));
    });

    // ─── Approve ───────────────────────────────────────────────────
    app.post('/opportunity/:id/approve', async (req, reply) => {
        const { id } = req.params as { id: string };
        const body = req.body as { edited_reply?: string; selected_variant?: string };

        const opp = OpportunityRepo.findById(id);
        if (!opp) { reply.code(404).send('Not found'); return; }

        const draft = DraftRepo.findByOpportunityId(id);
        let approvedReply = body.edited_reply || '';

        if (!approvedReply && draft) {
            // Use selected variant or default to short
            const variant = body.selected_variant || 'short';
            switch (variant) {
                case 'detailed': approvedReply = draft.variant_detailed; break;
                case 'no_link': approvedReply = draft.variant_no_link; break;
                default: approvedReply = draft.variant_short;
            }
        }

        ApprovalRepo.create({
            opportunity_id: id,
            edited_reply: body.edited_reply || null,
            approved_reply: approvedReply,
            approved_by: 'admin',
        });

        OpportunityRepo.updateStatus(id, 'approved');
        reply.redirect(`/opportunity/${id}`);
    });

    // ─── Reject ────────────────────────────────────────────────────
    app.post('/opportunity/:id/reject', async (req, reply) => {
        const { id } = req.params as { id: string };
        const body = req.body as { reason?: string };

        OpportunityRepo.updateStatus(id, 'rejected');
        ApprovalRepo.create({
            opportunity_id: id,
            approved_reply: '',
            approved_by: 'admin',
            rejected_reason: body.reason || 'Rejected by admin',
        });

        reply.redirect(`/opportunity/${id}`);
    });

    // ─── Mark Posted ───────────────────────────────────────────────
    app.post('/opportunity/:id/posted', async (req, reply) => {
        const { id } = req.params as { id: string };
        OpportunityRepo.updateStatus(id, 'posted');
        reply.redirect(`/opportunity/${id}`);
    });
}

function renderActions(status: string, id: string, draft: any, approval: any): string {
    if (status === 'pending' || status === 'new') {
        return `
      <div class="card card-full">
        <h3>⚡ Actions</h3>
        <form method="POST" action="/opportunity/${id}/approve" class="action-form">
          <div class="form-group">
            <label for="edited_reply">Edit Reply (optional — leave blank to use a draft variant):</label>
            <textarea name="edited_reply" id="edited_reply" rows="5" placeholder="Paste or type your edited reply here...">${draft?.variant_short || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Or select a variant:</label>
            <select name="selected_variant">
              <option value="short">Short</option>
              <option value="detailed">Detailed</option>
              <option value="no_link">No Link</option>
            </select>
          </div>
          <div class="btn-group">
            <button type="submit" class="btn btn-success">✓ Approve</button>
            <button type="submit" formaction="/opportunity/${id}/reject" class="btn btn-danger">✗ Reject</button>
          </div>
        </form>
        <form method="POST" action="/opportunity/${id}/reject" class="mt-2">
          <input type="text" name="reason" placeholder="Rejection reason (optional)">
        </form>
      </div>`;
    }

    if (status === 'approved' && approval) {
        return `
      <div class="card card-full">
        <h3>✅ Approved Reply</h3>
        <div class="approved-reply">${escapeHtml(approval.approved_reply)}</div>
        <div class="btn-group mt-2">
          <button class="btn btn-primary copy-btn" data-text="${escapeAttr(approval.approved_reply)}">📋 Copy Reply</button>
          <form method="POST" action="/opportunity/${id}/posted" style="display:inline">
            <button type="submit" class="btn btn-success">📮 Mark as Posted</button>
          </form>
        </div>
        <p class="text-muted mt-2">
          <em>After posting manually, click "Mark as Posted" to track it.</em>
        </p>
      </div>`;
    }

    if (status === 'posted') {
        return `
      <div class="card card-full">
        <h3>📮 Posted</h3>
        <div class="approved-reply">${escapeHtml(approval?.approved_reply || '(no reply stored)')}</div>
        <p class="text-muted">Posted by ${escapeHtml(approval?.approved_by || 'admin')} at ${approval?.approved_at || '—'}</p>
      </div>`;
    }

    return '';
}

function safeJsonParse(json: string, fallback: any): any {
    try { return JSON.parse(json); }
    catch { return fallback; }
}

function escapeAttr(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '&#10;');
}
