/**
 * One-time migration: add `teams` table and `team_id` column to `plays`.
 * Runs idempotently (safe to run multiple times).
 * Handles the drizzle-kit push limitation with SQLite foreign key columns.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { resolve, isAbsolute } = require("node:path");
const { existsSync, mkdirSync } = require("node:fs");
const { config } = require("dotenv");

const repoRoot = resolve(__dirname, "..");
config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, "apps/api/.env") });

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

let dbPath = raw;
if (raw.startsWith("file:")) dbPath = raw.slice("file:".length);
else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
  throw new Error(`Unsupported DATABASE_URL scheme for SQLite: ${raw.split(":")[0]}`);
}
if (!isAbsolute(dbPath)) dbPath = resolve(repoRoot, dbPath);

const dir = require("node:path").dirname(dbPath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const Database = require("better-sqlite3");
const db = new Database(dbPath);
db.pragma("foreign_keys = OFF");

const stmts = [
  `CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#e53935',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_teams_user ON teams(user_id)`,
];

const hasTeamId = db
  .prepare("PRAGMA table_info(plays)")
  .all()
  .some((c) => c.name === "team_id");

if (!hasTeamId) {
  stmts.push(`ALTER TABLE plays ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE SET NULL`);
}

for (const sql of stmts) {
  try {
    db.exec(sql);
  } catch (e) {
    console.log("  (skipped):", e.message);
  }
}

db.pragma("foreign_keys = ON");
db.close();
console.log("migrate-add-teams: done");
