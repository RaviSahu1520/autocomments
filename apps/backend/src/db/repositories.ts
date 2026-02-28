import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database.js';
import type {
    OpportunityRow,
    OpportunityStatus,
    ClassificationResult,
    ClassificationRow,
    ScoringRow,
    ScoreBreakdown,
    DraftResult,
    DraftRow,
    ApprovalRow,
    EventRow,
    AppConfig,
} from '../types.js';

// ─── Opportunities ──────────────────────────────────────────────────

export const OpportunityRepo = {
    create(item: {
        source: string;
        source_id: string;
        source_url: string;
        title: string;
        content: string;
        author: string;
        created_at_source: string;
        raw_json: string;
    }): string {
        const db = getDb();
        const id = uuidv4();
        const stmt = db.prepare(`
      INSERT OR IGNORE INTO opportunities (id, source, source_id, source_url, title, content, author, created_at_source, raw_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `);
        const result = stmt.run(id, item.source, item.source_id, item.source_url, item.title, item.content, item.author, item.created_at_source, item.raw_json);
        if (result.changes === 0) return ''; // duplicate
        return id;
    },

    findById(id: string): OpportunityRow | undefined {
        const db = getDb();
        return db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as OpportunityRow | undefined;
    },

    findBySourceId(source: string, source_id: string): OpportunityRow | undefined {
        const db = getDb();
        return db.prepare('SELECT * FROM opportunities WHERE source = ? AND source_id = ?').get(source, source_id) as OpportunityRow | undefined;
    },

    exists(source: string, source_id: string): boolean {
        const db = getDb();
        const row = db.prepare('SELECT 1 FROM opportunities WHERE source = ? AND source_id = ?').get(source, source_id);
        return !!row;
    },

    findByStatus(status: OpportunityStatus, limit = 50, offset = 0): OpportunityRow[] {
        const db = getDb();
        return db.prepare('SELECT * FROM opportunities WHERE status = ? ORDER BY collected_at DESC LIMIT ? OFFSET ?').all(status, limit, offset) as OpportunityRow[];
    },

    findAll(limit = 50, offset = 0, statusFilter?: string): OpportunityRow[] {
        const db = getDb();
        if (statusFilter && statusFilter !== 'all') {
            return db.prepare('SELECT * FROM opportunities WHERE status = ? ORDER BY collected_at DESC LIMIT ? OFFSET ?').all(statusFilter, limit, offset) as OpportunityRow[];
        }
        return db.prepare('SELECT * FROM opportunities ORDER BY collected_at DESC LIMIT ? OFFSET ?').all(limit, offset) as OpportunityRow[];
    },

    updateStatus(id: string, status: OpportunityStatus): void {
        const db = getDb();
        db.prepare('UPDATE opportunities SET status = ? WHERE id = ?').run(status, id);
    },

    countByStatus(): Record<string, number> {
        const db = getDb();
        const rows = db.prepare("SELECT status, COUNT(*) as count FROM opportunities GROUP BY status").all() as Array<{ status: string; count: number }>;
        const counts: Record<string, number> = { new: 0, pending: 0, approved: 0, rejected: 0, posted: 0, ignored: 0 };
        for (const row of rows) {
            counts[row.status] = row.count;
        }
        return counts;
    },

    countTotal(): number {
        const db = getDb();
        const row = db.prepare('SELECT COUNT(*) as count FROM opportunities').get() as { count: number };
        return row.count;
    },
};

// ─── Classification ─────────────────────────────────────────────────

export const ClassificationRepo = {
    upsert(opportunityId: string, result: ClassificationResult): void {
        const db = getDb();
        db.prepare(`
      INSERT OR REPLACE INTO classification (opportunity_id, is_real_estate_intent, intent_confidence, intent_type, locations_json, budget_range, timeline, needs_json, disallowed, reasoning_brief)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            opportunityId,
            result.is_real_estate_intent ? 1 : 0,
            result.intent_confidence,
            result.intent_type,
            JSON.stringify(result.locations),
            result.budget_range,
            result.timeline,
            JSON.stringify(result.needs),
            result.disallowed ? 1 : 0,
            result.reasoning_brief
        );
    },

    findByOpportunityId(opportunityId: string): ClassificationRow | undefined {
        const db = getDb();
        return db.prepare('SELECT * FROM classification WHERE opportunity_id = ?').get(opportunityId) as ClassificationRow | undefined;
    },
};

// ─── Scoring ────────────────────────────────────────────────────────

export const ScoringRepo = {
    upsert(opportunityId: string, score: number, breakdown: ScoreBreakdown): void {
        const db = getDb();
        db.prepare(`
      INSERT OR REPLACE INTO scoring (opportunity_id, score, breakdown_json)
      VALUES (?, ?, ?)
    `).run(opportunityId, score, JSON.stringify(breakdown));
    },

    findByOpportunityId(opportunityId: string): ScoringRow | undefined {
        const db = getDb();
        return db.prepare('SELECT * FROM scoring WHERE opportunity_id = ?').get(opportunityId) as ScoringRow | undefined;
    },
};

// ─── Drafts ─────────────────────────────────────────────────────────

export const DraftRepo = {
    upsert(opportunityId: string, result: DraftResult): void {
        const db = getDb();
        db.prepare(`
      INSERT OR REPLACE INTO drafts (opportunity_id, variant_short, variant_detailed, variant_no_link, followup_questions_json, safe_cta_link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            opportunityId,
            result.variant_short,
            result.variant_detailed,
            result.variant_no_link,
            JSON.stringify(result.suggested_followup_questions),
            result.safe_cta_link
        );
    },

    findByOpportunityId(opportunityId: string): DraftRow | undefined {
        const db = getDb();
        return db.prepare('SELECT * FROM drafts WHERE opportunity_id = ?').get(opportunityId) as DraftRow | undefined;
    },
};

// ─── Approvals ──────────────────────────────────────────────────────

export const ApprovalRepo = {
    create(data: {
        opportunity_id: string;
        edited_reply?: string | null;
        approved_reply: string;
        approved_by: string;
        rejected_reason?: string | null;
    }): void {
        const db = getDb();
        db.prepare(`
      INSERT OR REPLACE INTO approvals (opportunity_id, edited_reply, approved_reply, approved_by, rejected_reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(
            data.opportunity_id,
            data.edited_reply ?? null,
            data.approved_reply,
            data.approved_by,
            data.rejected_reason ?? null
        );
    },

    findByOpportunityId(opportunityId: string): ApprovalRow | undefined {
        const db = getDb();
        return db.prepare('SELECT * FROM approvals WHERE opportunity_id = ?').get(opportunityId) as ApprovalRow | undefined;
    },
};

// ─── Events ─────────────────────────────────────────────────────────

export const EventRepo = {
    create(data: {
        type: 'click' | 'conversion';
        opportunity_id?: string | null;
        url: string;
        meta?: Record<string, unknown>;
    }): string {
        const db = getDb();
        const id = uuidv4();
        db.prepare(`
      INSERT INTO events (id, type, opportunity_id, url, meta_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, data.type, data.opportunity_id ?? null, data.url, JSON.stringify(data.meta ?? {}));
        return id;
    },

    countByType(type: string, since?: string): number {
        const db = getDb();
        if (since) {
            const row = db.prepare('SELECT COUNT(*) as count FROM events WHERE type = ? AND created_at >= ?').get(type, since) as { count: number };
            return row.count;
        }
        const row = db.prepare('SELECT COUNT(*) as count FROM events WHERE type = ?').get(type) as { count: number };
        return row.count;
    },

    countByOpportunity(opportunityId: string, type: string): number {
        const db = getDb();
        const row = db.prepare('SELECT COUNT(*) as count FROM events WHERE opportunity_id = ? AND type = ?').get(opportunityId, type) as { count: number };
        return row.count;
    },
};

// ─── Config ─────────────────────────────────────────────────────────

export const ConfigRepo = {
    get(): AppConfig | null {
        const db = getDb();
        const row = db.prepare("SELECT json FROM config WHERE id = 'main'").get() as { json: string } | undefined;
        if (!row) return null;
        try {
            return JSON.parse(row.json) as AppConfig;
        } catch {
            return null;
        }
    },

    set(config: AppConfig): void {
        const db = getDb();
        db.prepare(`
      INSERT OR REPLACE INTO config (id, json, updated_at)
      VALUES ('main', ?, datetime('now'))
    `).run(JSON.stringify(config));
    },
};
