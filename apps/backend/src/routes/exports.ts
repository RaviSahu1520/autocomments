import type { FastifyInstance, FastifyReply } from 'fastify';
import { getDb } from '../db/database.js';
import { layout, escapeHtml } from '../utils/html.js';
import { rowsToCsv, rowsToExcelXml, type ExportRow } from '../utils/export.js';

const VALID_SOURCES = new Set(['reddit', 'discord', 'quora']);
const VALID_FORMATS = new Set(['json', 'csv', 'excel', 'xls', 'xlsx']);
const VALID_IG_DATASETS = new Set(['followers', 'following', 'posts', 'comments', 'likers']);

type OpportunityExportRow = {
    opportunity_id: string;
    source: string;
    source_id: string;
    source_url: string;
    title: string;
    content: string;
    author: string;
    created_at_source: string;
    collected_at: string;
    status: string;
    raw_json: string;
    is_real_estate_intent: number | null;
    intent_confidence: number | null;
    intent_type: string | null;
    locations_json: string | null;
    budget_range: string | null;
    timeline: string | null;
    needs_json: string | null;
    disallowed: number | null;
    reasoning_brief: string | null;
    score: number | null;
    breakdown_json: string | null;
    variant_short: string | null;
    variant_detailed: string | null;
    variant_no_link: string | null;
    followup_questions_json: string | null;
    safe_cta_link: string | null;
    edited_reply: string | null;
    approved_reply: string | null;
    approved_by: string | null;
    approved_at: string | null;
    rejected_reason: string | null;
    click_count: number;
    conversion_count: number;
};

export async function exportRoutes(app: FastifyInstance): Promise<void> {
    app.get('/exports', async (_req, reply) => {
        const db = getDb();
        const instagramCompetitors = hasTable('instagram_competitors')
            ? db.prepare('SELECT id, username FROM instagram_competitors ORDER BY username').all() as Array<{ id: string; username: string }>
            : [];

        const competitorLinks = instagramCompetitors.length > 0
            ? instagramCompetitors
                .map((c) =>
                    `<li>${escapeHtml(c.username)}:
                        <a href="/exports/instagram/${c.id}/master-audience.csv">CSV</a> |
                        <a href="/exports/instagram/${c.id}/master-audience.json">JSON</a> |
                        <a href="/exports/instagram/${c.id}/master-audience.excel">Excel</a>
                        <span class="text-muted"> | raw:</span>
                        <a href="/exports/instagram/${c.id}/followers.csv">followers</a>,
                        <a href="/exports/instagram/${c.id}/following.csv">following</a>,
                        <a href="/exports/instagram/${c.id}/posts.csv">posts</a>,
                        <a href="/exports/instagram/${c.id}/comments.csv">comments</a>,
                        <a href="/exports/instagram/${c.id}/likers.csv">likers</a>
                    </li>`)
                .join('')
            : '<li>No Instagram competitors imported yet.</li>';

        const html = `
      <div class="page-header">
        <h1>Exports</h1>
        <p class="subtitle">Download master and per-source dumps in CSV, JSON, or Excel-compatible format.</p>
      </div>
      <div class="detail-grid">
        <div class="card">
          <h3>Master Opportunity Dump</h3>
          <p><a href="/exports/master.csv">CSV</a> | <a href="/exports/master.json">JSON</a> | <a href="/exports/master.excel">Excel</a></p>
        </div>
        <div class="card">
          <h3>Per-Source Dumps</h3>
          <ul>
            <li>Reddit: <a href="/exports/source/reddit.csv">CSV</a> | <a href="/exports/source/reddit.json">JSON</a> | <a href="/exports/source/reddit.excel">Excel</a></li>
            <li>Discord: <a href="/exports/source/discord.csv">CSV</a> | <a href="/exports/source/discord.json">JSON</a> | <a href="/exports/source/discord.excel">Excel</a></li>
            <li>Quora: <a href="/exports/source/quora.csv">CSV</a> | <a href="/exports/source/quora.json">JSON</a> | <a href="/exports/source/quora.excel">Excel</a></li>
          </ul>
        </div>
        <div class="card card-full">
          <h3>Instagram Master Audience Dump</h3>
          <p><a href="/exports/instagram/master-audience.csv">CSV</a> | <a href="/exports/instagram/master-audience.json">JSON</a> | <a href="/exports/instagram/master-audience.excel">Excel</a></p>
          <p class="text-muted">Unique audience from followers, following, commenters, and likers imported through compliant sources.</p>
          <ul>${competitorLinks}</ul>
        </div>
      </div>
    `;

        reply.type('text/html').send(layout('Exports', html));
    });

    app.get('/exports/master.:format', async (req, reply) => {
        const { format } = req.params as { format: string };
        const rows = getOpportunityExportRows();
        sendRowsExport(reply, rows, format, 'opportunities_master');
    });

    app.get('/exports/source/:source.:format', async (req, reply) => {
        const { source, format } = req.params as { source: string; format: string };
        if (!VALID_SOURCES.has(source)) {
            reply.status(400).send({ error: 'source must be one of: reddit, discord, quora' });
            return;
        }
        const rows = getOpportunityExportRows(source);
        sendRowsExport(reply, rows, format, `opportunities_${source}`);
    });

    app.get('/exports/instagram/master-audience.:format', async (req, reply) => {
        const { format } = req.params as { format: string };
        const rows = getInstagramAudienceExportRows();
        sendRowsExport(reply, rows, format, 'instagram_master_audience');
    });

    app.get('/exports/instagram/:competitorId/master-audience.:format', async (req, reply) => {
        const { competitorId, format } = req.params as { competitorId: string; format: string };
        const rows = getInstagramAudienceExportRows(competitorId);
        sendRowsExport(reply, rows, format, `instagram_master_audience_${competitorId}`);
    });

    app.get('/exports/instagram/:competitorId/:dataset.:format', async (req, reply) => {
        const { competitorId, dataset, format } = req.params as { competitorId: string; dataset: string; format: string };
        if (!VALID_IG_DATASETS.has(dataset)) {
            reply.status(400).send({ error: 'dataset must be one of followers, following, posts, comments, likers' });
            return;
        }
        const rows = getInstagramDatasetRows(competitorId, dataset);
        sendRowsExport(reply, rows, format, `instagram_${dataset}_${competitorId}`);
    });
}

function getOpportunityExportRows(source?: string): ExportRow[] {
    const db = getDb();
    const whereClause = source ? 'WHERE o.source = ?' : '';
    const params = source ? [source] : [];

    const rows = db.prepare(`
    SELECT
      o.id AS opportunity_id,
      o.source,
      o.source_id,
      o.source_url,
      o.title,
      o.content,
      o.author,
      o.created_at_source,
      o.collected_at,
      o.status,
      o.raw_json,
      c.is_real_estate_intent,
      c.intent_confidence,
      c.intent_type,
      c.locations_json,
      c.budget_range,
      c.timeline,
      c.needs_json,
      c.disallowed,
      c.reasoning_brief,
      s.score,
      s.breakdown_json,
      d.variant_short,
      d.variant_detailed,
      d.variant_no_link,
      d.followup_questions_json,
      d.safe_cta_link,
      a.edited_reply,
      a.approved_reply,
      a.approved_by,
      a.approved_at,
      a.rejected_reason,
      (SELECT COUNT(*) FROM events e WHERE e.opportunity_id = o.id AND e.type = 'click') AS click_count,
      (SELECT COUNT(*) FROM events e WHERE e.opportunity_id = o.id AND e.type = 'conversion') AS conversion_count
    FROM opportunities o
    LEFT JOIN classification c ON c.opportunity_id = o.id
    LEFT JOIN scoring s ON s.opportunity_id = o.id
    LEFT JOIN drafts d ON d.opportunity_id = o.id
    LEFT JOIN approvals a ON a.opportunity_id = o.id
    ${whereClause}
    ORDER BY o.collected_at DESC
  `).all(...params) as OpportunityExportRow[];

    return rows.map((row) => {
        const classificationJson = {
            is_real_estate_intent: row.is_real_estate_intent === 1,
            intent_confidence: row.intent_confidence ?? 0,
            intent_type: row.intent_type ?? 'none',
            locations: safeParseJson(row.locations_json, []),
            budget_range: row.budget_range ?? 'unknown',
            timeline: row.timeline ?? 'unknown',
            needs: safeParseJson(row.needs_json, []),
            disallowed: row.disallowed === 1,
            reasoning_brief: row.reasoning_brief ?? '',
        };

        const draftsJson = {
            variant_short: row.variant_short ?? '',
            variant_detailed: row.variant_detailed ?? '',
            variant_no_link: row.variant_no_link ?? '',
            followup_questions: safeParseJson(row.followup_questions_json, []),
            safe_cta_link: row.safe_cta_link ?? null,
        };

        const approvalJson = {
            edited_reply: row.edited_reply ?? null,
            approved_reply: row.approved_reply ?? null,
            approved_by: row.approved_by ?? null,
            approved_at: row.approved_at ?? null,
            rejected_reason: row.rejected_reason ?? null,
        };

        return {
            opportunity_id: row.opportunity_id,
            source: row.source,
            source_id: row.source_id,
            source_url: row.source_url,
            title: row.title,
            content: row.content,
            author: row.author,
            created_at_source: row.created_at_source,
            collected_at: row.collected_at,
            status: row.status,
            raw_content_json: row.raw_json,
            classification_json: JSON.stringify(classificationJson),
            score: row.score ?? 0,
            score_breakdown_json: row.breakdown_json ?? '{}',
            drafts_json: JSON.stringify(draftsJson),
            approval_json: JSON.stringify(approvalJson),
            final_approved_reply: row.approved_reply ?? '',
            click_count: row.click_count,
            conversion_count: row.conversion_count,
        };
    });
}

function getInstagramAudienceExportRows(competitorId?: string): ExportRow[] {
    const db = getDb();
    if (!hasTable('instagram_competitors') || !hasTable('instagram_relationships') || !hasTable('instagram_posts')) {
        return [];
    }

    const filter = competitorId ? 'AND c.id = ?' : '';
    const params = competitorId ? [competitorId, competitorId, competitorId, competitorId] : [];

    const query = `
    SELECT c.id AS competitor_id, c.username AS competitor_username, 'follower' AS audience_source, r.account_id, r.username AS audience_username, r.full_name AS audience_full_name, r.imported_at AS first_seen_at
    FROM instagram_relationships r
    JOIN instagram_competitors c ON c.id = r.competitor_id
    WHERE r.relation_type = 'follower' ${filter}

    UNION ALL

    SELECT c.id AS competitor_id, c.username AS competitor_username, 'following' AS audience_source, r.account_id, r.username AS audience_username, r.full_name AS audience_full_name, r.imported_at AS first_seen_at
    FROM instagram_relationships r
    JOIN instagram_competitors c ON c.id = r.competitor_id
    WHERE r.relation_type = 'following' ${filter}

    UNION ALL

    SELECT c.id AS competitor_id, c.username AS competitor_username, 'commenter' AS audience_source, cm.account_id, cm.username AS audience_username, '' AS audience_full_name, cm.imported_at AS first_seen_at
    FROM instagram_comments cm
    JOIN instagram_posts p ON p.id = cm.post_row_id
    JOIN instagram_competitors c ON c.id = p.competitor_id
    WHERE 1=1 ${filter}

    UNION ALL

    SELECT c.id AS competitor_id, c.username AS competitor_username, 'liker' AS audience_source, l.account_id, l.username AS audience_username, '' AS audience_full_name, l.imported_at AS first_seen_at
    FROM instagram_likers l
    JOIN instagram_posts p ON p.id = l.post_row_id
    JOIN instagram_competitors c ON c.id = p.competitor_id
    WHERE 1=1 ${filter}
  `;

    const rows = db.prepare(query).all(...params) as Array<{
        competitor_id: string;
        competitor_username: string;
        audience_source: string;
        account_id: string;
        audience_username: string;
        audience_full_name: string;
        first_seen_at: string;
    }>;

    const deduped = new Map<string, ExportRow>();
    for (const row of rows) {
        const key = [
            row.competitor_id,
            row.audience_source,
            row.account_id || '',
            (row.audience_username || '').toLowerCase(),
        ].join('|');

        if (!deduped.has(key)) {
            deduped.set(key, {
                competitor_id: row.competitor_id,
                competitor_username: row.competitor_username,
                audience_source: row.audience_source,
                audience_account_id: row.account_id || '',
                audience_username: row.audience_username || '',
                audience_full_name: row.audience_full_name || '',
                first_seen_at: row.first_seen_at || '',
            });
        }
    }

    return Array.from(deduped.values());
}

function getInstagramDatasetRows(competitorId: string, dataset: string): ExportRow[] {
    const db = getDb();
    if (!hasTable('instagram_competitors')) return [];

    if (dataset === 'followers' || dataset === 'following') {
        return db.prepare(`
      SELECT
        c.id AS competitor_id,
        c.username AS competitor_username,
        r.relation_type,
        r.account_id,
        r.username,
        r.full_name,
        r.imported_at
      FROM instagram_relationships r
      JOIN instagram_competitors c ON c.id = r.competitor_id
      WHERE c.id = ? AND r.relation_type = ?
      ORDER BY r.imported_at DESC
    `).all(competitorId, dataset === 'followers' ? 'follower' : 'following') as ExportRow[];
    }

    if (dataset === 'posts') {
        return db.prepare(`
      SELECT
        c.id AS competitor_id,
        c.username AS competitor_username,
        p.post_id,
        p.shortcode,
        p.permalink,
        p.media_type,
        p.is_reel,
        p.caption,
        p.posted_at,
        p.like_count,
        p.comment_count,
        p.imported_at
      FROM instagram_posts p
      JOIN instagram_competitors c ON c.id = p.competitor_id
      WHERE c.id = ?
      ORDER BY p.posted_at DESC, p.imported_at DESC
    `).all(competitorId) as ExportRow[];
    }

    if (dataset === 'comments') {
        return db.prepare(`
      SELECT
        c.id AS competitor_id,
        c.username AS competitor_username,
        p.post_id,
        cm.comment_id,
        cm.account_id,
        cm.username,
        cm.text,
        cm.like_count,
        cm.posted_at,
        cm.imported_at
      FROM instagram_comments cm
      JOIN instagram_posts p ON p.id = cm.post_row_id
      JOIN instagram_competitors c ON c.id = p.competitor_id
      WHERE c.id = ?
      ORDER BY cm.posted_at DESC, cm.imported_at DESC
    `).all(competitorId) as ExportRow[];
    }

    return db.prepare(`
    SELECT
      c.id AS competitor_id,
      c.username AS competitor_username,
      p.post_id,
      l.account_id,
      l.username,
      l.imported_at
    FROM instagram_likers l
    JOIN instagram_posts p ON p.id = l.post_row_id
    JOIN instagram_competitors c ON c.id = p.competitor_id
    WHERE c.id = ?
    ORDER BY l.imported_at DESC
  `).all(competitorId) as ExportRow[];
}

function sendRowsExport(reply: FastifyReply, rows: ExportRow[], formatRaw: string, filenameBase: string): void {
    const format = formatRaw.toLowerCase();
    if (!VALID_FORMATS.has(format)) {
        reply.status(400).send({ error: 'format must be one of: json, csv, excel' });
        return;
    }

    if (format === 'json') {
        reply
            .header('Content-Type', 'application/json; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${filenameBase}.json"`)
            .send(JSON.stringify(rows, null, 2));
        return;
    }

    if (format === 'csv') {
        reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${filenameBase}.csv"`)
            .send(rowsToCsv(rows));
        return;
    }

    reply
        .header('Content-Type', 'application/vnd.ms-excel; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filenameBase}.xls"`)
        .send(rowsToExcelXml(rows, 'Export'));
}

function hasTable(tableName: string): boolean {
    const db = getDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
    return !!row;
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}
