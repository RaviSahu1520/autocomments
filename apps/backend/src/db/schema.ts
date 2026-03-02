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

    CREATE TABLE IF NOT EXISTS instagram_competitors (
      id TEXT PRIMARY KEY,
      instagram_id TEXT,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      profile_url TEXT NOT NULL DEFAULT '',
      is_our_account INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(instagram_id),
      UNIQUE(username)
    );

    CREATE TABLE IF NOT EXISTS instagram_relationships (
      id TEXT PRIMARY KEY,
      competitor_id TEXT NOT NULL REFERENCES instagram_competitors(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('follower','following')),
      account_id TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL DEFAULT '{}',
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(competitor_id, relation_type, account_id, username)
    );

    CREATE INDEX IF NOT EXISTS idx_ig_rel_comp ON instagram_relationships(competitor_id, relation_type);

    CREATE TABLE IF NOT EXISTS instagram_posts (
      id TEXT PRIMARY KEY,
      competitor_id TEXT NOT NULL REFERENCES instagram_competitors(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL,
      shortcode TEXT NOT NULL DEFAULT '',
      permalink TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL DEFAULT 'unknown',
      is_reel INTEGER NOT NULL DEFAULT 0,
      posted_at TEXT NOT NULL DEFAULT '',
      like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL DEFAULT '{}',
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(competitor_id, post_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ig_posts_comp ON instagram_posts(competitor_id, posted_at);

    CREATE TABLE IF NOT EXISTS instagram_comments (
      id TEXT PRIMARY KEY,
      post_row_id TEXT NOT NULL REFERENCES instagram_posts(id) ON DELETE CASCADE,
      comment_id TEXT NOT NULL,
      account_id TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      like_count INTEGER NOT NULL DEFAULT 0,
      posted_at TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL DEFAULT '{}',
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(post_row_id, comment_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ig_comments_post ON instagram_comments(post_row_id);

    CREATE TABLE IF NOT EXISTS instagram_likers (
      id TEXT PRIMARY KEY,
      post_row_id TEXT NOT NULL REFERENCES instagram_posts(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL DEFAULT '{}',
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(post_row_id, account_id, username)
    );

    CREATE INDEX IF NOT EXISTS idx_ig_likers_post ON instagram_likers(post_row_id);

    CREATE TABLE IF NOT EXISTS instagram_import_runs (
      id TEXT PRIMARY KEY,
      competitor_id TEXT NOT NULL REFERENCES instagram_competitors(id) ON DELETE CASCADE,
      dataset_type TEXT NOT NULL CHECK(dataset_type IN ('followers','following','posts','comments','likers')),
      records_received INTEGER NOT NULL DEFAULT 0,
      records_upserted INTEGER NOT NULL DEFAULT 0,
      records_skipped INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      summary_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ig_import_runs_comp ON instagram_import_runs(competitor_id, created_at);
  `);
}
