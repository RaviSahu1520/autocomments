import Database from 'better-sqlite3';

export function createSchema(db: Database.Database): void {
    db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      id TEXT PRIMARY KEY DEFAULT 'main',
      json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK(source IN ('reddit','discord','quora')),
      source_id TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      created_at_source TEXT NOT NULL DEFAULT '',
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      raw_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','pending','approved','rejected','posted','ignored')),
      UNIQUE(source, source_id)
    );

    CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
    CREATE INDEX IF NOT EXISTS idx_opp_source ON opportunities(source);
    CREATE INDEX IF NOT EXISTS idx_opp_collected ON opportunities(collected_at);

    CREATE TABLE IF NOT EXISTS classification (
      opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id),
      is_real_estate_intent INTEGER NOT NULL DEFAULT 0,
      intent_confidence REAL NOT NULL DEFAULT 0,
      intent_type TEXT NOT NULL DEFAULT 'none',
      locations_json TEXT NOT NULL DEFAULT '[]',
      budget_range TEXT NOT NULL DEFAULT 'unknown',
      timeline TEXT NOT NULL DEFAULT 'unknown',
      needs_json TEXT NOT NULL DEFAULT '[]',
      disallowed INTEGER NOT NULL DEFAULT 0,
      reasoning_brief TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scoring (
      opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id),
      score REAL NOT NULL DEFAULT 0,
      breakdown_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS drafts (
      opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id),
      variant_short TEXT NOT NULL DEFAULT '',
      variant_detailed TEXT NOT NULL DEFAULT '',
      variant_no_link TEXT NOT NULL DEFAULT '',
      followup_questions_json TEXT NOT NULL DEFAULT '[]',
      safe_cta_link TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS approvals (
      opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id),
      edited_reply TEXT,
      approved_reply TEXT NOT NULL DEFAULT '',
      approved_by TEXT NOT NULL DEFAULT 'admin',
      approved_at TEXT NOT NULL DEFAULT (datetime('now')),
      rejected_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('click','conversion')),
      opportunity_id TEXT,
      url TEXT NOT NULL DEFAULT '',
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_opp ON events(opportunity_id);
  `);
}
