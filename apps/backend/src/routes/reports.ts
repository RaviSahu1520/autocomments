import type { FastifyInstance } from 'fastify';
import { OpportunityRepo, EventRepo } from '../db/repositories.js';
import { getDb } from '../db/database.js';
import { layout, escapeHtml } from '../utils/html.js';

export async function reportRoutes(app: FastifyInstance): Promise<void> {

    app.get('/reports/weekly', async (req, reply) => {
        const format = (req.query as { format?: string }).format;
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const report = generateReport(since, 'Weekly');

        if (format === 'json') {
            reply.send(report);
            return;
        }

        reply.type('text/html').send(layout('Weekly Report', renderReport(report, 'Weekly')));
    });

    app.get('/reports/daily', async (req, reply) => {
        const format = (req.query as { format?: string }).format;
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const report = generateReport(since, 'Daily');

        if (format === 'json') {
            reply.send(report);
            return;
        }

        reply.type('text/html').send(layout('Daily Report', renderReport(report, 'Daily')));
    });
}

interface ReportData {
    period: string;
    since: string;
    total_opportunities: number;
    by_status: Record<string, number>;
    by_source: Record<string, number>;
    total_clicks: number;
    total_conversions: number;
    top_opportunities: Array<{
        id: string;
        title: string;
        source: string;
        score: number;
        status: string;
        clicks: number;
    }>;
}

function generateReport(since: string, period: string): ReportData {
    const db = getDb();

    // Count by status (since)
    const statusRows = db.prepare(`
    SELECT status, COUNT(*) as count FROM opportunities
    WHERE collected_at >= ?
    GROUP BY status
  `).all(since) as Array<{ status: string; count: number }>;

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusRows) {
        byStatus[row.status] = row.count;
        total += row.count;
    }

    // Count by source
    const sourceRows = db.prepare(`
    SELECT source, COUNT(*) as count FROM opportunities
    WHERE collected_at >= ?
    GROUP BY source
  `).all(since) as Array<{ source: string; count: number }>;

    const bySource: Record<string, number> = {};
    for (const row of sourceRows) {
        bySource[row.source] = row.count;
    }

    // Events
    const clicks = EventRepo.countByType('click', since);
    const conversions = EventRepo.countByType('conversion', since);

    // Top opportunities
    const topRows = db.prepare(`
    SELECT o.id, o.title, o.content, o.source, o.status, COALESCE(s.score, 0) as score
    FROM opportunities o
    LEFT JOIN scoring s ON o.id = s.opportunity_id
    WHERE o.collected_at >= ?
    ORDER BY s.score DESC NULLS LAST
    LIMIT 10
  `).all(since) as Array<{ id: string; title: string; content: string; source: string; status: string; score: number }>;

    const topOpportunities = topRows.map(row => ({
        id: row.id,
        title: row.title || row.content?.substring(0, 80) || 'Untitled',
        source: row.source,
        score: row.score,
        status: row.status,
        clicks: EventRepo.countByOpportunity(row.id, 'click'),
    }));

    return {
        period,
        since,
        total_opportunities: total,
        by_status: byStatus,
        by_source: bySource,
        total_clicks: clicks,
        total_conversions: conversions,
        top_opportunities: topOpportunities,
    };
}

function renderReport(report: ReportData, period: string): string {
    const statusCards = Object.entries(report.by_status).map(([status, count]) =>
        `<div class="stat-card">
      <div class="stat-value">${count}</div>
      <div class="stat-label">${status}</div>
    </div>`
    ).join('');

    const sourceCards = Object.entries(report.by_source).map(([source, count]) =>
        `<div class="stat-card">
      <div class="stat-value">${count}</div>
      <div class="stat-label">${source}</div>
    </div>`
    ).join('');

    const topRows = report.top_opportunities.map(opp =>
        `<tr>
      <td><a href="/opportunity/${opp.id}">${escapeHtml(opp.title.substring(0, 60))}</a></td>
      <td>${opp.source}</td>
      <td class="text-center">${opp.score}</td>
      <td>${opp.status}</td>
      <td class="text-center">${opp.clicks}</td>
    </tr>`
    ).join('');

    return `
    <div class="page-header">
      <h1>📈 ${period} Report</h1>
      <p class="subtitle">Since ${new Date(report.since).toLocaleDateString()}</p>
      <a href="/reports/${period.toLowerCase()}?format=json" class="btn-sm btn-outline">📥 JSON</a>
    </div>

    <div class="stat-grid">
      <div class="stat-card stat-highlight">
        <div class="stat-value">${report.total_opportunities}</div>
        <div class="stat-label">Total Opportunities</div>
      </div>
      <div class="stat-card stat-highlight">
        <div class="stat-value">${report.total_clicks}</div>
        <div class="stat-label">Clicks</div>
      </div>
      <div class="stat-card stat-highlight">
        <div class="stat-value">${report.total_conversions}</div>
        <div class="stat-label">Conversions</div>
      </div>
    </div>

    <div class="detail-grid">
      <div class="card">
        <h3>By Status</h3>
        <div class="stat-grid">${statusCards || '<p class="text-muted">No data</p>'}</div>
      </div>
      <div class="card">
        <h3>By Source</h3>
        <div class="stat-grid">${sourceCards || '<p class="text-muted">No data</p>'}</div>
      </div>
    </div>

    <div class="card card-full">
      <h3>Top Opportunities</h3>
      <table class="table">
        <thead>
          <tr><th>Title</th><th>Source</th><th class="text-center">Score</th><th>Status</th><th class="text-center">Clicks</th></tr>
        </thead>
        <tbody>
          ${topRows || '<tr><td colspan="5" class="empty-state">No data</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}
