import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
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
  `);
  return db;
}

export function publicUser(row) {
  return row ? { id: row.id, username: row.username, name: row.name, bio: row.bio, joined: row.created_at } : null;
}

export function userStats(db, userId) {
  const stats = db.prepare(`SELECT COUNT(*) AS entries, COUNT(DISTINCT film_id) AS films,
    COALESCE(ROUND(AVG(rating), 1), 0) AS average,
    SUM(CASE WHEN review != '' THEN 1 ELSE 0 END) AS reviews FROM entries WHERE user_id = ?`).get(userId);
  const watchlist = db.prepare('SELECT COUNT(*) AS count FROM watchlist WHERE user_id = ?').get(userId).count;
  return { ...stats, reviews: stats.reviews || 0, watchlist };
}

export function entryRows(db, where, args = []) {
  return db.prepare(`SELECT e.*, f.json, u.username, u.name FROM entries e
    JOIN films f ON f.id = e.film_id JOIN users u ON u.id = e.user_id
    WHERE ${where} ORDER BY e.watched_on DESC, e.created_at DESC LIMIT 200`).all(...args).map(row => ({
    id: row.id, userId: row.user_id, film: JSON.parse(row.json), rating: row.rating,
    review: row.review, watchedOn: row.watched_on, spoilers: Boolean(row.spoilers),
    createdAt: row.created_at, username: row.username, name: row.name
  }));
}
