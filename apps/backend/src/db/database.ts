import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSchema } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
    if (!db) {
        const dataDir = path.resolve(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const dbPath = path.join(dataDir, 'autocomments.db');
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        createSchema(db);
    }
    return db;
}

export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}
