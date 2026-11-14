// Local development only. Hosted deployments use Supabase PostgreSQL.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function sqliteDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS films (
      id INTEGER PRIMARY KEY, json TEXT NOT NULL, cached_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      film_id INTEGER NOT NULL REFERENCES films(id), rating REAL NOT NULL CHECK(rating >= .5 AND rating <= 5),
      review TEXT NOT NULL DEFAULT '', watched_on TEXT NOT NULL,
      spoilers INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS entries_user_date ON entries(user_id, watched_on DESC);
    CREATE INDEX IF NOT EXISTS entries_film ON entries(film_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS watchlist (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      film_id INTEGER NOT NULL REFERENCES films(id), created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, film_id)
    );
    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      film_id INTEGER NOT NULL REFERENCES films(id), created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, film_id)
    );

    CREATE TABLE IF NOT EXISTS auth_attempts (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
    );
`);
  const db = {
    kind: 'sqlite',
    prepare(sql) { return {
      get: async (...args) => raw.prepare(sql).get(...args),
      all: async (...args) => raw.prepare(sql).all(...args),
      run: async (...args) => raw.prepare(sql).run(...args)
    }; },
    exec: async sql => raw.exec(sql),
    lockUser: async () => {},
    async transaction(action) { raw.exec('BEGIN IMMEDIATE'); try { const result = await action(db); raw.exec('COMMIT'); return result; } catch (error) { raw.exec('ROLLBACK'); throw error; } },
    close: async () => raw.close()
  };
  return db;
}
