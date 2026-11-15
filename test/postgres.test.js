import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../server.js';
import { openDatabase, postgresSQL } from '../lib/database.js';
import { migrateDatabase } from '../lib/migrations.js';
import { importRows } from '../lib/import.js';
import { hashPassword } from '../lib/auth.js';
import { testPostgres } from '../test-support/postgres.js';
import { createCatalog } from '../lib/catalog.js';

const userData = name => ({ name, username: name.toLowerCase(), email: `${name.toLowerCase()}@example.com`, password: 'a-good-password-for-the-migration' });
const entry = { filmId: 693134, rating: 4.5, review: 'Stored in PostgreSQL.', watchedOn: '2026-01-20', spoilers: false };

async function startPostgres() {
  const { db, engine } = await testPostgres(); await migrateDatabase(db);
  const app = await createApp({ database: db, tmdbToken: '', tmdbKey: '' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const client = () => {
    let cookie = '', csrf = '';
    return async (path, method = 'GET', data) => {
      const response = await fetch(origin + path, { method, headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
      const value = await response.json();
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      if (value.csrf) csrf = value.csrf;
      return { status: response.status, value };
    };
  };
  return { ...app, engine, origin, client };
}

test('PostgreSQL SQL conversion qualifies private tables and preserves parameterized text', () => {
  assert.equal(postgresSQL("SELECT '?' AS literal FROM users WHERE email = ?"), "SELECT '?' AS literal FROM final_take.users WHERE email = $1");
  assert.equal(postgresSQL('SELECT COUNT(*) AS films FROM entries WHERE user_id = ?'), 'SELECT COUNT(*) AS films FROM final_take.entries WHERE user_id = $1');
});

test('PostgreSQL discovery batches film persistence and preserves complete cached records', async t => {
  const { db } = await testPostgres(); t.after(() => db.close()); await migrateDatabase(db);
  let calls = 0;
  const catalog = await createCatalog(db, { tmdbToken: 'test-only-token', fetcher: async url => {
    calls++;
    if (new URL(url).pathname === '/3/movie/900001') return { ok: true, json: async () => ({ id: 900001, title: 'Discovery', runtime: 110, genres: [{ name: 'Drama' }] }) };
    return { ok: true, json: async () => ({ total_pages: 1, results: [693134, 900001, 900002].map(id => ({ id, title: 'Discovery', poster_path: '/poster.jpg', genre_ids: [18] })) }) };
  } });
  const result = await catalog.list();
  assert.equal(result.films.length, 3);
  assert.equal(result.films[0].title, 'Dune: Part Two');
  assert.equal((await catalog.get(900001)).runtime, 110);
  await catalog.list();
  assert.equal(calls, 2, 'one list request and one complete detail request');
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM films').get()).count, 19);
});

test('PostgreSQL migrations are repeatable, preserve records, and isolate credentials from API roles', async t => {
  const { db, engine } = await testPostgres(); t.after(() => db.close());
  await engine.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN');
  assert.equal((await migrateDatabase(db)).length, 1);
  await db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run('test-id', 'existing', 'existing@example.com', 'Existing', 'test-hash', '', '2026-01-01');
  assert.equal((await migrateDatabase(db)).length, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM users').get()).count, 1);
  const access = await engine.query("SELECT has_schema_privilege('anon', 'final_take', 'USAGE') AS anon, has_schema_privilege('authenticated', 'final_take', 'USAGE') AS authenticated");
  assert.deepEqual(access.rows[0], { anon: false, authenticated: false });
  const rls = await engine.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='final_take' AND c.relkind='r' AND c.relrowsecurity");
  assert.equal(rls.rows.length, 7);
});

test('Supabase PostgreSQL path supports accounts, numeric ratings, diary CRUD, profiles, watchlists and favorite limits', async t => {
  const app = await startPostgres(); t.after(app.close); const alice = app.client(), bob = app.client();
  assert.equal((await alice('/api/auth/register', 'POST', userData('Alice'))).status, 201);
  assert.equal((await bob('/api/auth/register', 'POST', userData('Bob'))).status, 201);
  const saved = await alice('/api/entries', 'POST', entry); assert.equal(saved.status, 201);
  const diary = await alice('/api/me/diary'); assert.equal(diary.value.entries[0].rating, 4.5);
  assert.equal((await bob(`/api/entries/${saved.value.id}`, 'DELETE')).status, 404);
  await alice('/api/watchlist/693134', 'PUT'); assert.equal((await alice('/api/me/watchlist')).value.films.length, 1);
  for (const id of [693134, 27205, 438631]) assert.equal((await alice(`/api/favorites/${id}`, 'PUT')).status, 200);
  const attempts = await Promise.all([alice('/api/favorites/155', 'PUT'), alice('/api/favorites/157336', 'PUT')]);
  assert.deepEqual(attempts.map(x => x.status).sort(), [200, 400]);
  const profile = (await bob('/api/members/alice')).value;
  assert.equal(profile.favorites.length, 4); assert.equal(profile.stats.entries, 1); assert.equal(profile.stats.average, 4.5);
  await alice(`/api/entries/${saved.value.id}`, 'PATCH', { ...entry, rating: 3.5, review: 'An edited take.' });
  const detail = (await bob('/api/films/693134')).value; assert.equal(detail.aggregate.average, 3.5); assert.equal(detail.aggregate.count, 1);
  await alice(`/api/entries/${saved.value.id}`, 'DELETE'); assert.equal((await alice('/api/me/diary')).value.entries.length, 0);
});

test('SQLite import keeps account hashes and identifiers, and repeated imports do not duplicate diary data', async t => {
  const { db } = await testPostgres(); t.after(() => db.close()); await migrateDatabase(db);
  const hash = await hashPassword('old-password-still-works');
  const rows = {
    users: [{ id: 'old-user', username: 'olduser', email: 'old@example.com', name: 'Old User', password_hash: hash, bio: 'Preserved', created_at: '2025-01-01' }],
    entries: [{ id: 'old-entry', user_id: 'old-user', film_id: 693134, rating: 4.5, review: 'Keep this review.', watched_on: '2025-01-02', spoilers: 0, created_at: '2025-01-02', updated_at: '2025-01-02' }],
    watchlist: [{ user_id: 'old-user', film_id: 27205, created_at: '2025-01-02' }]
  };
  assert.equal(await importRows(db, rows), 3); assert.equal(await importRows(db, rows), 0);
  assert.equal((await db.prepare('SELECT password_hash FROM users WHERE id = ?').get('old-user')).password_hash, hash);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM entries').get()).count, 1);
});

test('Vercel initialization requires hosted credentials instead of opening a local SQLite file', async () => {
  await assert.rejects(openDatabase('/unwritable/database.sqlite', { connectionString: '', hosted: true }), /DATABASE_URL is required/);
});

test('Vercel entry point returns a controlled response when the database is unconfigured', async t => {
  const handler = (await import('../api/index.js')).default;
  const original = Object.fromEntries(['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'SUPABASE_DB_URL'].map(name => [name, process.env[name]]));
  for (const key of Object.keys(original)) delete process.env[key];
  t.after(() => { for (const [key, value] of Object.entries(original)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const server = createServer(handler); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session`);
  assert.equal(response.status, 503); assert.match((await response.json()).error, /temporarily unavailable/i);
});
