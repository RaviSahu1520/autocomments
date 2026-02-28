import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createSchema } from '../db/schema.js';
import { v4 as uuidv4 } from 'uuid';

// We test against an in-memory SQLite instance
// to verify the schema and basic repo operations

describe('Approval Routes Integration', () => {
    let db: Database.Database;

    beforeAll(() => {
        db = new Database(':memory:');
        db.pragma('foreign_keys = ON');
        createSchema(db);
    });

    afterAll(() => {
        db.close();
    });

    it('should create an opportunity', () => {
        const id = uuidv4();
        db.prepare(`
      INSERT INTO opportunities (id, source, source_id, source_url, title, content, author, status)
      VALUES (?, 'reddit', 'test1', 'https://reddit.com/test', 'Test Title', 'Test Content', 'user1', 'pending')
    `).run(id);

        const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as any;
        expect(row).toBeTruthy();
        expect(row.status).toBe('pending');
        expect(row.source).toBe('reddit');
    });

    it('should update opportunity status to approved', () => {
        const id = uuidv4();
        db.prepare(`
      INSERT INTO opportunities (id, source, source_id, source_url, title, content, author, status)
      VALUES (?, 'reddit', 'test2', 'https://reddit.com/test2', 'Test', 'Content', 'user1', 'pending')
    `).run(id);

        db.prepare('UPDATE opportunities SET status = ? WHERE id = ?').run('approved', id);

        const row = db.prepare('SELECT status FROM opportunities WHERE id = ?').get(id) as any;
        expect(row.status).toBe('approved');
    });

    it('should create an approval record', () => {
        const id = uuidv4();
        db.prepare(`
      INSERT INTO opportunities (id, source, source_id, source_url, title, content, author, status)
      VALUES (?, 'reddit', 'test3', 'https://reddit.com/test3', 'Test', 'Content', 'user1', 'approved')
    `).run(id);

        db.prepare(`
      INSERT INTO approvals (opportunity_id, approved_reply, approved_by)
      VALUES (?, 'Great advice reply', 'admin')
    `).run(id);

        const approval = db.prepare('SELECT * FROM approvals WHERE opportunity_id = ?').get(id) as any;
        expect(approval).toBeTruthy();
        expect(approval.approved_reply).toBe('Great advice reply');
        expect(approval.approved_by).toBe('admin');
    });

    it('should enforce unique source+source_id constraint', () => {
        const id1 = uuidv4();
        const id2 = uuidv4();

        db.prepare(`
      INSERT INTO opportunities (id, source, source_id, source_url, title, content, author, status)
      VALUES (?, 'reddit', 'unique_test', 'url', 'Title', 'Content', 'user', 'new')
    `).run(id1);

        // Should fail or be ignored due to UNIQUE constraint
        const result = db.prepare(`
      INSERT OR IGNORE INTO opportunities (id, source, source_id, source_url, title, content, author, status)
      VALUES (?, 'reddit', 'unique_test', 'url', 'Title2', 'Content2', 'user2', 'new')
    `).run(id2);

        expect(result.changes).toBe(0);
    });

    it('should track events', () => {
        const eventId = uuidv4();
        db.prepare(`
      INSERT INTO events (id, type, url, meta_json)
      VALUES (?, 'click', 'https://example.com', '{}')
    `).run(eventId);

        const count = db.prepare("SELECT COUNT(*) as c FROM events WHERE type = 'click'").get() as any;
        expect(count.c).toBeGreaterThan(0);
    });

    it('should handle status transitions correctly', () => {
        const id = uuidv4();
        db.prepare(`
      INSERT INTO opportunities (id, source, source_id, source_url, title, content, author, status)
      VALUES (?, 'discord', 'disc1', 'https://discord.com/test', 'Test', 'Content', 'user1', 'new')
    `).run(id);

        // new -> pending
        db.prepare('UPDATE opportunities SET status = ? WHERE id = ?').run('pending', id);
        let row = db.prepare('SELECT status FROM opportunities WHERE id = ?').get(id) as any;
        expect(row.status).toBe('pending');

        // pending -> approved
        db.prepare('UPDATE opportunities SET status = ? WHERE id = ?').run('approved', id);
        row = db.prepare('SELECT status FROM opportunities WHERE id = ?').get(id) as any;
        expect(row.status).toBe('approved');

        // approved -> posted
        db.prepare('UPDATE opportunities SET status = ? WHERE id = ?').run('posted', id);
        row = db.prepare('SELECT status FROM opportunities WHERE id = ?').get(id) as any;
        expect(row.status).toBe('posted');
    });
});
