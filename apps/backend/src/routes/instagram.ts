import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { timingSafeEqual } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { layout, escapeHtml, timeAgo } from '../utils/html.js';

type DatasetType = 'followers' | 'following' | 'posts' | 'comments' | 'likers';

interface ImportSummary {
    dataset_type: DatasetType;
    records_received: number;
    records_upserted: number;
    records_skipped: number;
    error_count: number;
}

const VALID_DATASET_TYPES = new Set<DatasetType>(['followers', 'following', 'posts', 'comments', 'likers']);
const DEFAULT_INGEST_MAX_RECORDS = 5000;
const DEFAULT_INGEST_RATE_LIMIT_PER_MIN = 30;
const DEFAULT_INGEST_BODY_LIMIT_BYTES = 1024 * 1024;
const INGEST_MAX_RECORDS = parsePositiveInt(process.env.INGEST_MAX_RECORDS, DEFAULT_INGEST_MAX_RECORDS);
const INGEST_RATE_LIMIT_PER_MIN = parsePositiveInt(process.env.INGEST_RATE_LIMIT_PER_MIN, DEFAULT_INGEST_RATE_LIMIT_PER_MIN);
const INGEST_BODY_LIMIT_BYTES = parsePositiveInt(process.env.INGEST_MAX_BODY_BYTES, DEFAULT_INGEST_BODY_LIMIT_BYTES);
const ingestRateState = new Map<string, { windowStartMs: number; count: number }>();

export async function instagramRoutes(app: FastifyInstance): Promise<void> {
    app.get('/instagram', async (_req, reply) => {
        const db = getDb();
        const competitors = db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM instagram_relationships r WHERE r.competitor_id = c.id AND r.relation_type = 'follower') AS followers_count,
        (SELECT COUNT(*) FROM instagram_relationships r WHERE r.competitor_id = c.id AND r.relation_type = 'following') AS following_count,
        (SELECT COUNT(*) FROM instagram_posts p WHERE p.competitor_id = c.id) AS posts_count,
        (SELECT COUNT(*) FROM instagram_comments cm JOIN instagram_posts p ON p.id = cm.post_row_id WHERE p.competitor_id = c.id) AS comments_count,
        (SELECT COUNT(*) FROM instagram_likers l JOIN instagram_posts p ON p.id = l.post_row_id WHERE p.competitor_id = c.id) AS likers_count
      FROM instagram_competitors c
      ORDER BY c.updated_at DESC
    `).all() as Array<{
            id: string;
            instagram_id: string | null;
            username: string;
            display_name: string;
            profile_url: string;
            is_our_account: number;
            notes: string;
            updated_at: string;
            followers_count: number;
            following_count: number;
            posts_count: number;
            comments_count: number;
            likers_count: number;
        }>;

        const rows = competitors.map((c) => `
      <tr>
        <td><a href="/instagram/${c.id}">${escapeHtml(c.username)}</a></td>
        <td>${escapeHtml(c.instagram_id || '-')}</td>
        <td class="text-center">${c.followers_count}</td>
        <td class="text-center">${c.following_count}</td>
        <td class="text-center">${c.posts_count}</td>
        <td class="text-center">${c.comments_count}</td>
        <td class="text-center">${c.likers_count}</td>
        <td>${timeAgo(c.updated_at)}</td>
      </tr>
    `).join('');

        const html = `
      <div class="page-header">
        <h1>Instagram Competitor Module</h1>
        <p class="subtitle">Compliant ingestion only: import data from official APIs, approved vendors, or manual exports. No scraping.</p>
      </div>

      <div class="card" style="max-width: 800px;">
        <h3>Add / Update Competitor</h3>
        <form method="POST" action="/instagram/competitors" class="action-form">
          <div class="form-group">
            <label for="username">Instagram Username *</label>
            <input id="username" name="username" type="text" required placeholder="example: acme_realty">
          </div>
          <div class="form-group">
            <label for="instagram_id">Instagram Numeric ID (optional but recommended)</label>
            <input id="instagram_id" name="instagram_id" type="text" placeholder="17841400000000000">
          </div>
          <div class="form-group">
            <label for="display_name">Display Name</label>
            <input id="display_name" name="display_name" type="text" placeholder="Acme Realty">
          </div>
          <div class="form-group">
            <label for="notes">Notes</label>
            <input id="notes" name="notes" type="text" placeholder="Market leader in Delhi NCR">
          </div>
          <label style="display:flex; align-items:center; gap:0.5rem;">
            <input type="checkbox" name="is_our_account" value="true">
            This is our own account (for audience insights segregation)
          </label>
          <button class="btn btn-primary" type="submit">Save Competitor</button>
        </form>
      </div>

      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Instagram ID</th>
              <th class="text-center">Followers</th>
              <th class="text-center">Following</th>
              <th class="text-center">Posts/Reels</th>
              <th class="text-center">Comments</th>
              <th class="text-center">Likers</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8" class="empty-state">No competitors added yet</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

        reply.type('text/html').send(layout('Instagram Module', html));
    });

    app.post('/instagram/competitors', async (req, reply) => {
        const body = req.body as {
            instagram_id?: string;
            username?: string;
            display_name?: string;
            notes?: string;
            is_our_account?: string;
        };

        const username = normalizeUsername(body.username || '');
        if (!username) {
            reply.status(400).type('text/html').send(layout('Invalid Input', `
        <div class="card">
          <div class="alert alert-danger">Username is required.</div>
          <a href="/instagram" class="btn btn-outline">Back</a>
        </div>
      `));
            return;
        }

        const instagramId = asString(body.instagram_id);
        const displayName = asString(body.display_name) || username;
        const notes = asString(body.notes);
        const isOurAccount = body.is_our_account === 'true' || body.is_our_account === 'on' ? 1 : 0;
        const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;

        const db = getDb();
        try {
            db.prepare(`
        INSERT INTO instagram_competitors (id, instagram_id, username, display_name, profile_url, is_our_account, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
          instagram_id = excluded.instagram_id,
          display_name = excluded.display_name,
          profile_url = excluded.profile_url,
          is_our_account = excluded.is_our_account,
          notes = excluded.notes,
          updated_at = datetime('now')
      `).run(uuidv4(), instagramId || null, username, displayName, profileUrl, isOurAccount, notes);
        } catch (err) {
            reply.status(400).type('text/html').send(layout('Save Failed', `
        <div class="card">
          <div class="alert alert-danger">Failed to save competitor: ${escapeHtml(String(err))}</div>
          <a href="/instagram" class="btn btn-outline">Back</a>
        </div>
      `));
            return;
        }

        reply.redirect('/instagram');
    });

    app.get('/instagram/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const query = req.query as { msg?: string; err?: string };
        const db = getDb();

        const competitor = db.prepare('SELECT * FROM instagram_competitors WHERE id = ?').get(id) as {
            id: string;
            instagram_id: string | null;
            username: string;
            display_name: string;
            profile_url: string;
            is_our_account: number;
            notes: string;
            updated_at: string;
        } | undefined;

        if (!competitor) {
            reply.code(404).type('text/html').send(layout('Not Found', '<h1>Competitor not found</h1>'));
            return;
        }

        const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM instagram_relationships WHERE competitor_id = ? AND relation_type = 'follower') AS followers_count,
        (SELECT COUNT(*) FROM instagram_relationships WHERE competitor_id = ? AND relation_type = 'following') AS following_count,
        (SELECT COUNT(*) FROM instagram_posts WHERE competitor_id = ?) AS posts_count,
        (SELECT COUNT(*) FROM instagram_comments cm JOIN instagram_posts p ON p.id = cm.post_row_id WHERE p.competitor_id = ?) AS comments_count,
        (SELECT COUNT(*) FROM instagram_likers l JOIN instagram_posts p ON p.id = l.post_row_id WHERE p.competitor_id = ?) AS likers_count
    `).get(id, id, id, id, id) as {
            followers_count: number;
            following_count: number;
            posts_count: number;
            comments_count: number;
            likers_count: number;
        };

        const posts = db.prepare(`
      SELECT post_id, media_type, is_reel, permalink, caption, posted_at, like_count, comment_count
      FROM instagram_posts
      WHERE competitor_id = ?
      ORDER BY posted_at DESC, imported_at DESC
      LIMIT 20
    `).all(id) as Array<{
            post_id: string;
            media_type: string;
            is_reel: number;
            permalink: string;
            caption: string;
            posted_at: string;
            like_count: number;
            comment_count: number;
        }>;

        const importRuns = db.prepare(`
      SELECT dataset_type, records_received, records_upserted, records_skipped, error_count, created_at
      FROM instagram_import_runs
      WHERE competitor_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(id) as Array<{
            dataset_type: DatasetType;
            records_received: number;
            records_upserted: number;
            records_skipped: number;
            error_count: number;
            created_at: string;
        }>;

        const postRows = posts.map((post) => `
      <tr>
        <td>${escapeHtml(post.post_id)}</td>
        <td>${escapeHtml(post.media_type)}${post.is_reel ? ' (reel)' : ''}</td>
        <td class="text-center">${post.like_count}</td>
        <td class="text-center">${post.comment_count}</td>
        <td>${post.posted_at ? timeAgo(post.posted_at) : '-'}</td>
        <td><a class="btn-sm btn-outline" href="${escapeHtml(post.permalink)}" target="_blank">Open</a></td>
      </tr>
    `).join('');

        const runRows = importRuns.map((run) => `
      <tr>
        <td>${run.dataset_type}</td>
        <td class="text-center">${run.records_received}</td>
        <td class="text-center">${run.records_upserted}</td>
        <td class="text-center">${run.records_skipped}</td>
        <td class="text-center">${run.error_count}</td>
        <td>${timeAgo(run.created_at)}</td>
      </tr>
    `).join('');

        const messageHtml = query.msg
            ? `<div class="alert alert-success">${escapeHtml(query.msg)}</div>`
            : query.err ? `<div class="alert alert-danger">${escapeHtml(query.err)}</div>` : '';

        const html = `
      <div class="page-header">
        <a href="/instagram" class="back-link">Back to Instagram Module</a>
        <div class="header-row">
          <h1>@${escapeHtml(competitor.username)}</h1>
        </div>
        <p class="subtitle">${escapeHtml(competitor.display_name || '')} ${competitor.is_our_account ? '(our account)' : ''}</p>
      </div>
      ${messageHtml}

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${stats.followers_count}</div><div class="stat-label">Followers</div></div>
        <div class="stat-card"><div class="stat-value">${stats.following_count}</div><div class="stat-label">Following</div></div>
        <div class="stat-card"><div class="stat-value">${stats.posts_count}</div><div class="stat-label">Posts/Reels</div></div>
        <div class="stat-card"><div class="stat-value">${stats.comments_count}</div><div class="stat-label">Comments</div></div>
        <div class="stat-card"><div class="stat-value">${stats.likers_count}</div><div class="stat-label">Likers</div></div>
      </div>

      <div class="detail-grid">
        <div class="card">
          <h3>Import Dataset</h3>
          <p class="text-muted">Paste JSON array from official API/export. Supported types: followers, following, posts, comments, likers.</p>
          <form method="POST" action="/instagram/${competitor.id}/import" class="action-form">
            <div class="form-group">
              <label for="dataset_type">Dataset Type</label>
              <select id="dataset_type" name="dataset_type" required>
                <option value="followers">followers</option>
                <option value="following">following</option>
                <option value="posts">posts</option>
                <option value="comments">comments</option>
                <option value="likers">likers</option>
              </select>
            </div>
            <div class="form-group">
              <label for="payload_json">Payload JSON</label>
              <textarea id="payload_json" name="payload_json" rows="14" class="code-editor" placeholder='[{"id":"123","username":"sample_user"}]' required></textarea>
            </div>
            <button class="btn btn-primary" type="submit">Import Data</button>
          </form>
        </div>
        <div class="card">
          <h3>Automation API</h3>
          <p class="text-muted">POST JSON to <code>/api/instagram/import</code> with header <code>x-api-key</code> (INGEST_API_KEY).</p>
          <div class="content-box" style="max-height:none;">
{
  "competitor_id": "${escapeHtml(competitor.id)}",
  "dataset_type": "followers",
  "records": [{"id":"123","username":"sample_user"}]
}
          </div>
          <p class="mt-2"><a href="/exports/instagram/${competitor.id}/master-audience.csv">Download Competitor Master Audience CSV</a></p>
          <p class="text-muted">Raw dataset exports:
            <a href="/exports/instagram/${competitor.id}/followers.csv">followers</a>,
            <a href="/exports/instagram/${competitor.id}/following.csv">following</a>,
            <a href="/exports/instagram/${competitor.id}/posts.csv">posts</a>,
            <a href="/exports/instagram/${competitor.id}/comments.csv">comments</a>,
            <a href="/exports/instagram/${competitor.id}/likers.csv">likers</a>
          </p>
        </div>
        <div class="card card-full">
          <h3>Recent Posts/Reels</h3>
          <table class="table">
            <thead><tr><th>Post ID</th><th>Type</th><th class="text-center">Likes</th><th class="text-center">Comments</th><th>Posted</th><th>Link</th></tr></thead>
            <tbody>${postRows || '<tr><td colspan="6" class="empty-state">No posts imported yet</td></tr>'}</tbody>
          </table>
        </div>
        <div class="card card-full">
          <h3>Import History</h3>
          <table class="table">
            <thead><tr><th>Dataset</th><th class="text-center">Received</th><th class="text-center">Upserted</th><th class="text-center">Skipped</th><th class="text-center">Errors</th><th>Time</th></tr></thead>
            <tbody>${runRows || '<tr><td colspan="6" class="empty-state">No imports yet</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;

        reply.type('text/html').send(layout(`Instagram: @${competitor.username}`, html));
    });

    app.post('/instagram/:id/import', async (req, reply) => {
        const { id } = req.params as { id: string };
        const body = req.body as { dataset_type?: string; payload_json?: string };
        const datasetType = (body.dataset_type || '') as DatasetType;

        if (!VALID_DATASET_TYPES.has(datasetType)) {
            reply.redirect(`/instagram/${encodeURIComponent(id)}?err=${encodeURIComponent('Invalid dataset type.')}`);
            return;
        }

        let records: unknown[];
        try {
            records = parseRecordsPayload(body.payload_json || '');
        } catch (err) {
            reply.redirect(`/instagram/${encodeURIComponent(id)}?err=${encodeURIComponent(`Invalid payload JSON: ${String(err)}`)}`);
            return;
        }

        if (records.length > INGEST_MAX_RECORDS) {
            reply.redirect(`/instagram/${encodeURIComponent(id)}?err=${encodeURIComponent(`Payload exceeds max records (${INGEST_MAX_RECORDS}).`)}`);
            return;
        }

        try {
            const summary = importInstagramDataset(getDb(), id, datasetType, records);
            const msg = `${summary.dataset_type}: received=${summary.records_received}, upserted=${summary.records_upserted}, skipped=${summary.records_skipped}, errors=${summary.error_count}`;
            reply.redirect(`/instagram/${encodeURIComponent(id)}?msg=${encodeURIComponent(msg)}`);
        } catch (err) {
            reply.redirect(`/instagram/${encodeURIComponent(id)}?err=${encodeURIComponent(String(err))}`);
        }
    });

    app.post('/api/instagram/import', { bodyLimit: INGEST_BODY_LIMIT_BYTES }, async (req, reply) => {
        const expectedApiKey = (process.env.INGEST_API_KEY || '').trim();
        if (!expectedApiKey) {
            reply.status(503).send({ error: 'INGEST_API_KEY is not configured on server.' });
            return;
        }

        const clientIp = req.ip || 'unknown';
        if (!consumeIngestRateAllowance(clientIp)) {
            reply
                .header('Retry-After', '60')
                .status(429)
                .send({ error: `Rate limit exceeded: max ${INGEST_RATE_LIMIT_PER_MIN} requests per minute per IP.` });
            return;
        }

        const providedApiKey = String(req.headers['x-api-key'] || '');
        if (!safeEqual(providedApiKey, expectedApiKey)) {
            reply.status(401).send({ error: 'Unauthorized' });
            return;
        }

        const body = req.body as {
            competitor_id?: string;
            competitor_username?: string;
            competitor_instagram_id?: string;
            dataset_type?: string;
            records?: unknown;
        };

        const datasetType = (body.dataset_type || '') as DatasetType;
        if (!VALID_DATASET_TYPES.has(datasetType)) {
            reply.status(400).send({ error: 'dataset_type must be one of followers, following, posts, comments, likers' });
            return;
        }

        if (!Array.isArray(body.records)) {
            reply.status(400).send({ error: 'records must be a JSON array.' });
            return;
        }

        if (body.records.length > INGEST_MAX_RECORDS) {
            reply.status(413).send({ error: `Payload exceeds max records (${INGEST_MAX_RECORDS}).` });
            return;
        }

        const db = getDb();
        const competitorId = resolveCompetitorId(db, {
            competitorId: asString(body.competitor_id),
            competitorUsername: normalizeUsername(body.competitor_username || ''),
            competitorInstagramId: asString(body.competitor_instagram_id),
        });

        if (!competitorId) {
            reply.status(404).send({ error: 'Competitor not found. Provide competitor_id or valid username/instagram_id.' });
            return;
        }

        const records = body.records;
        try {
            const summary = importInstagramDataset(db, competitorId, datasetType, records);
            reply.send({ status: 'ok', competitor_id: competitorId, summary });
        } catch (err) {
            reply.status(500).send({ error: String(err) });
        }
    });
}

function importInstagramDataset(db: Database.Database, competitorId: string, datasetType: DatasetType, records: unknown[]): ImportSummary {
    const summary: ImportSummary = {
        dataset_type: datasetType,
        records_received: records.length,
        records_upserted: 0,
        records_skipped: 0,
        error_count: 0,
    };

    db.prepare('UPDATE instagram_competitors SET updated_at = datetime(\'now\') WHERE id = ?').run(competitorId);

    const tx = db.transaction((items: unknown[]) => {
        for (const item of items) {
            try {
                switch (datasetType) {
                    case 'followers':
                    case 'following':
                        upsertRelationship(db, competitorId, datasetType, item, summary);
                        break;
                    case 'posts':
                        upsertPost(db, competitorId, item, summary);
                        break;
                    case 'comments':
                        upsertComment(db, competitorId, item, summary);
                        break;
                    case 'likers':
                        upsertLiker(db, competitorId, item, summary);
                        break;
                }
            } catch {
                summary.error_count += 1;
            }
        }
    });

    tx(records);

    db.prepare(`
    INSERT INTO instagram_import_runs (id, competitor_id, dataset_type, records_received, records_upserted, records_skipped, error_count, summary_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        uuidv4(),
        competitorId,
        datasetType,
        summary.records_received,
        summary.records_upserted,
        summary.records_skipped,
        summary.error_count,
        JSON.stringify(summary)
    );

    return summary;
}

function upsertRelationship(
    db: Database.Database,
    competitorId: string,
    relationType: 'followers' | 'following',
    rawItem: unknown,
    summary: ImportSummary
): void {
    const item = rawItem as Record<string, unknown>;
    const accountId = asString(item.account_id ?? item.user_id ?? item.id);
    const username = normalizeUsername(item.username ?? item.handle ?? item.user_name ?? '');
    const fullName = asString(item.full_name ?? item.name ?? '');

    if (!accountId && !username) {
        summary.records_skipped += 1;
        return;
    }

    db.prepare(`
    INSERT INTO instagram_relationships (id, competitor_id, relation_type, account_id, username, full_name, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(competitor_id, relation_type, account_id, username) DO UPDATE SET
      full_name = excluded.full_name,
      raw_json = excluded.raw_json,
      imported_at = datetime('now')
  `).run(
        uuidv4(),
        competitorId,
        relationType === 'followers' ? 'follower' : 'following',
        accountId,
        username,
        fullName,
        JSON.stringify(item)
    );
    summary.records_upserted += 1;
}

function upsertPost(db: Database.Database, competitorId: string, rawItem: unknown, summary: ImportSummary): void {
    const item = rawItem as Record<string, unknown>;
    const postId = asString(item.post_id ?? item.media_id ?? item.id ?? item.shortcode ?? item.permalink);
    const shortcode = asString(item.shortcode);
    const permalink = asString(item.permalink ?? item.url);
    const caption = asString(item.caption ?? item.text ?? '');
    const mediaType = asString(item.media_type ?? item.type ?? 'unknown').toLowerCase();
    const postedAt = asString(item.posted_at ?? item.timestamp ?? '');
    const likeCount = toInt(item.like_count ?? item.likes ?? 0);
    const commentCount = toInt(item.comment_count ?? item.comments_count ?? 0);
    const isReel = mediaType.includes('reel') ? 1 : toInt(item.is_reel ?? 0);

    if (!postId) {
        summary.records_skipped += 1;
        return;
    }

    db.prepare(`
    INSERT INTO instagram_posts (id, competitor_id, post_id, shortcode, permalink, caption, media_type, is_reel, posted_at, like_count, comment_count, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(competitor_id, post_id) DO UPDATE SET
      shortcode = excluded.shortcode,
      permalink = excluded.permalink,
      caption = excluded.caption,
      media_type = excluded.media_type,
      is_reel = excluded.is_reel,
      posted_at = excluded.posted_at,
      like_count = excluded.like_count,
      comment_count = excluded.comment_count,
      raw_json = excluded.raw_json,
      imported_at = datetime('now')
  `).run(
        uuidv4(),
        competitorId,
        postId,
        shortcode,
        permalink,
        caption,
        mediaType,
        isReel ? 1 : 0,
        postedAt,
        likeCount,
        commentCount,
        JSON.stringify(item)
    );
    summary.records_upserted += 1;
}

function upsertComment(db: Database.Database, competitorId: string, rawItem: unknown, summary: ImportSummary): void {
    const item = rawItem as Record<string, unknown>;
    const postLookup = resolvePostLookup(item);
    const postRowId = findPostRowId(db, competitorId, postLookup);
    const commentId = asString(item.comment_id ?? item.id);
    const accountId = asString(item.account_id ?? item.user_id ?? item.from_id);
    const username = normalizeUsername(item.username ?? item.from_username ?? item.author ?? '');
    const text = asString(item.text ?? item.message ?? '');
    const likeCount = toInt(item.like_count ?? item.likes ?? 0);
    const postedAt = asString(item.posted_at ?? item.timestamp ?? '');

    if (!postRowId || !commentId) {
        summary.records_skipped += 1;
        return;
    }

    db.prepare(`
    INSERT INTO instagram_comments (id, post_row_id, comment_id, account_id, username, text, like_count, posted_at, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_row_id, comment_id) DO UPDATE SET
      account_id = excluded.account_id,
      username = excluded.username,
      text = excluded.text,
      like_count = excluded.like_count,
      posted_at = excluded.posted_at,
      raw_json = excluded.raw_json,
      imported_at = datetime('now')
  `).run(
        uuidv4(),
        postRowId,
        commentId,
        accountId,
        username,
        text,
        likeCount,
        postedAt,
        JSON.stringify(item)
    );
    summary.records_upserted += 1;
}

function upsertLiker(db: Database.Database, competitorId: string, rawItem: unknown, summary: ImportSummary): void {
    const item = rawItem as Record<string, unknown>;
    const postLookup = resolvePostLookup(item);
    const postRowId = findPostRowId(db, competitorId, postLookup);
    const accountId = asString(item.account_id ?? item.user_id ?? item.id);
    const username = normalizeUsername(item.username ?? item.handle ?? item.user_name ?? '');

    if (!postRowId || (!accountId && !username)) {
        summary.records_skipped += 1;
        return;
    }

    db.prepare(`
    INSERT INTO instagram_likers (id, post_row_id, account_id, username, raw_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(post_row_id, account_id, username) DO UPDATE SET
      raw_json = excluded.raw_json,
      imported_at = datetime('now')
  `).run(
        uuidv4(),
        postRowId,
        accountId,
        username,
        JSON.stringify(item)
    );
    summary.records_upserted += 1;
}

function resolvePostLookup(item: Record<string, unknown>): { postId: string; shortcode: string; permalink: string } {
    return {
        postId: asString(item.post_id ?? item.media_id ?? item.post ?? item.id),
        shortcode: asString(item.shortcode),
        permalink: asString(item.permalink ?? item.url),
    };
}

function findPostRowId(
    db: Database.Database,
    competitorId: string,
    lookup: { postId: string; shortcode: string; permalink: string }
): string | null {
    if (!lookup.postId && !lookup.shortcode && !lookup.permalink) return null;

    const row = db.prepare(`
    SELECT id
    FROM instagram_posts
    WHERE competitor_id = ?
      AND (
        post_id = ?
        OR shortcode = ?
        OR permalink = ?
      )
    LIMIT 1
  `).get(competitorId, lookup.postId, lookup.shortcode, lookup.permalink) as { id: string } | undefined;

    return row?.id || null;
}

function resolveCompetitorId(
    db: Database.Database,
    args: { competitorId: string; competitorUsername: string; competitorInstagramId: string }
): string | null {
    if (args.competitorId) {
        const row = db.prepare('SELECT id FROM instagram_competitors WHERE id = ?').get(args.competitorId) as { id: string } | undefined;
        if (row) return row.id;
    }

    if (args.competitorUsername) {
        const row = db.prepare('SELECT id FROM instagram_competitors WHERE username = ?').get(args.competitorUsername) as { id: string } | undefined;
        if (row) return row.id;
    }

    if (args.competitorInstagramId) {
        const row = db.prepare('SELECT id FROM instagram_competitors WHERE instagram_id = ?').get(args.competitorInstagramId) as { id: string } | undefined;
        if (row) return row.id;
    }

    return null;
}

function parseRecordsPayload(raw: string): unknown[] {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { records?: unknown[] }).records)) {
            return (parsed as { records: unknown[] }).records;
        }
        throw new Error('JSON payload must be an array or object with a records array.');
    } catch (firstErr) {
        // Fallback to JSON Lines format.
        const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
        const records = lines.map((line) => JSON.parse(line) as unknown);
        if (records.length === 0) throw firstErr;
        return records;
    }
}

function normalizeUsername(value: unknown): string {
    return asString(value).replace(/^@+/, '').trim().toLowerCase();
}

function asString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function toInt(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n));
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

function consumeIngestRateAllowance(clientIp: string): boolean {
    const now = Date.now();
    const windowMs = 60_000;
    const existing = ingestRateState.get(clientIp);

    if (!existing || now - existing.windowStartMs >= windowMs) {
        ingestRateState.set(clientIp, { windowStartMs: now, count: 1 });
        pruneOldRateWindows(now, windowMs);
        return true;
    }

    if (existing.count >= INGEST_RATE_LIMIT_PER_MIN) {
        return false;
    }

    existing.count += 1;
    return true;
}

function pruneOldRateWindows(nowMs: number, windowMs: number): void {
    if (ingestRateState.size <= 1024) return;
    for (const [ip, state] of ingestRateState.entries()) {
        if (nowMs - state.windowStartMs >= windowMs) ingestRateState.delete(ip);
    }
}
