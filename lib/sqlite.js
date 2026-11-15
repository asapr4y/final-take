// Local development only. Hosted deployments use Supabase PostgreSQL.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
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
    CREATE INDEX IF NOT EXISTS auth_attempts_reset ON auth_attempts(reset_at);
    CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS entries_user_page ON entries(user_id, watched_on DESC, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS entries_film_reviews_page ON entries(film_id, watched_on DESC, created_at DESC, id DESC) WHERE review != '';
    CREATE INDEX IF NOT EXISTS entries_user_film_page ON entries(user_id, film_id, watched_on DESC, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS watchlist_user_page ON watchlist(user_id, created_at DESC, film_id DESC);
    CREATE TABLE IF NOT EXISTS catalog_cache (key TEXT PRIMARY KEY, json TEXT NOT NULL, cached_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS catalog_cache_age ON catalog_cache(cached_at);
`);
  // Other requests must not run inside a transaction while its callback is awaiting.
  const context = new AsyncLocalStorage();
  let queue = Promise.resolve();
  const serialized = action => {
    if (context.getStore()) return Promise.resolve().then(action);
    const result = queue.then(() => context.run(true, action));
    queue = result.catch(() => {});
    return result;
  };
  const db = {
    kind: 'sqlite',
    prepare(sql) { return {
      get: (...args) => serialized(() => raw.prepare(sql).get(...args)),
      all: (...args) => serialized(() => raw.prepare(sql).all(...args)),
      run: (...args) => serialized(() => raw.prepare(sql).run(...args))
    }; },
    exec: sql => serialized(() => raw.exec(sql)),
    lockUser: async () => {},
    transaction: action => serialized(async () => { raw.exec('BEGIN IMMEDIATE'); try { const result = await action(db); raw.exec('COMMIT'); return result; } catch (error) { raw.exec('ROLLBACK'); throw error; } }),
    close: () => serialized(() => raw.close())
  };
  return db;
}
