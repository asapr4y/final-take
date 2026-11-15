import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { sqliteDatabase } from '../lib/sqlite.js';
import { testPostgres } from '../test-support/postgres.js';
import { migrateDatabase } from '../lib/migrations.js';
import { hashPassword } from '../lib/auth.js';

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: large collections paginate without gaps, preserve totals, and isolate edits`, async t => {
    const db = backend === 'sqlite' ? sqliteDatabase(':memory:') : (await testPostgres()).db;
    if (backend === 'postgres') await migrateDatabase(db);
    const app = await createApp({ database: db, tmdbToken: '', tmdbKey: '' });
    t.after(app.close);
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    let cookie = '';
    async function request(path, data) {
      const response = await fetch(origin + path, { method: data ? 'POST' : 'GET',
        headers: { Cookie: cookie, Origin: origin, ...(data ? { 'Content-Type': 'application/json' } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}) });
      const value = await response.json();
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { response, value };
    }
    const account = await request('/api/auth/register', { name: 'Alice', username: 'alice', email: 'alice@example.com', password: 'a-long-test-password' });
    assert.equal(account.response.status, 201);
    const user = account.value.user.id;
    const date = '2026-01-20T12:00:00.000Z';
    const ids = Array.from({ length: 245 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    await db.prepare(`INSERT INTO entries VALUES ${ids.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`)
      .run(...ids.flatMap(id => [id, user, 693134, 4.5, 'A rewatch.', '2026-01-20', 0, date, date]));
    const expected = [...ids].reverse();
    const first = await request('/api/me/diary?limit=17');
    assert.equal(first.value.entries.length, 17);
    assert.equal(first.value.stats.entries, 245);
    assert.equal(first.value.stats.films, 1);
    assert.equal(first.value.stats.average, 4.5);
    assert.equal('overview' in first.value.entries[0].film, false, 'collection payloads omit unused movie details');
    const seen = first.value.entries.map(row => row.id);
    let cursor = first.value.nextCursor;
    // A new item before the current position must not duplicate or hide older items.
    await db.prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('ffffffff-ffff-4fff-8fff-ffffffffffff', user, 693134, 5, '', '2026-02-20', 0, date, date);
    while (cursor) {
      const result = await request(`/api/me/diary?limit=17&cursor=${cursor}`);
      assert.equal(result.response.status, 200);
      seen.push(...result.value.entries.map(row => row.id));
      cursor = result.value.nextCursor;
      assert.ok(seen.length <= 245, 'pagination terminates');
    }
    assert.deepEqual(seen, expected);
    const film = (await request('/api/films/693134?limit=13')).value;
    assert.equal(film.reviews.length, 13);
    assert.equal(film.aggregate.reviews, 245);
    assert.equal(film.aggregate.count, 246);
    assert.equal(film.my.entries.length, 1, 'film detail loads the latest personal viewing only');
    const reviewIDs = film.reviews.map(row => row.id);
    cursor = film.nextCursor;
    while (cursor) {
      const result = await request(`/api/films/693134?limit=100&cursor=${cursor}`);
      reviewIDs.push(...result.value.reviews.map(row => row.id));
      cursor = result.value.nextCursor;
      assert.ok(reviewIDs.length <= 245);
    }
    assert.deepEqual(reviewIDs, expected);
    const edit = (await request(`/api/films/693134?edit=${ids[0]}`)).value;
    assert.equal(edit.my.entries[0].id, ids[0], 'an old entry remains editable beyond the first page');
    await db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run('bob', 'bob', 'bob@example.com', 'Bob', 'unused', '', date);
    await db.prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob', 693134, 1, 'Bob only.', '2026-01-20', 0, date, date);
    assert.equal((await request('/api/films/693134?edit=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).response.status, 404);
    const profile = (await request('/api/members/ALICE')).value;
    assert.equal(profile.entries.length, 6);
    assert.equal(profile.stats.entries, 246);
    const films = await db.prepare('SELECT id FROM films ORDER BY id DESC').all();
    await db.prepare(`INSERT INTO watchlist VALUES ${films.map(() => '(?, ?, ?)').join(', ')}`).run(...films.flatMap(f => [user, f.id, date]));
    const watch = (await request('/api/me/watchlist?limit=5')).value;
    assert.equal(watch.total, 17);
    const watched = watch.films.map(f => f.id);
    cursor = watch.nextCursor;
    while (cursor) {
      const result = await request(`/api/me/watchlist?limit=5&cursor=${cursor}`);
      watched.push(...result.value.films.map(f => f.id));
      cursor = result.value.nextCursor;
      assert.ok(watched.length <= 17);
    }
    assert.deepEqual(watched, films.map(f => f.id));
    for (const path of ['/api/me/diary', '/api/me/watchlist', '/api/films/693134']) {
      for (const query of ['limit=0', 'limit=101', 'limit=no', 'limit=1.5', 'cursor=bad', 'cursor=W10', 'cursor=%27']) {
        assert.equal((await request(`${path}?${query}`)).response.status, 400, `${path}?${query}`);
      }
    }
    assert.equal((await request('/api/me/diary')).response.headers.get('cache-control'), 'no-store');
    cookie = '';
    assert.equal((await request('/api/me/diary')).response.status, 401);
    assert.equal((await request(`/api/films/693134?edit=${ids[0]}`)).response.status, 404);
  });
}

test('SQLite transactions keep unrelated concurrent writes outside rollbacks', async t => {
  const db = sqliteDatabase(':memory:'); t.after(() => db.close());
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const transaction = db.transaction(async tx => {
    await tx.prepare('INSERT INTO auth_attempts VALUES (?, ?, ?)').run('rolled-back', 1, 0);
    entered(); await hold;
    throw new Error('Rollback this transaction');
  });
  const rejected = assert.rejects(transaction, /Rollback/);
  await ready;
  const independent = db.prepare('INSERT INTO auth_attempts VALUES (?, ?, ?)').run('independent', 1, 0);
  release(); await rejected; await independent;
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM auth_attempts').get()).count, 1);
  assert.ok(await db.prepare('SELECT key FROM auth_attempts WHERE key = ?').get('independent'));
});

test('password hashing bounds concurrent memory use and rejects excess queued work', async () => {
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => hashPassword('test-password-for-overload')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 10);
  const rejected = results.filter(result => result.status === 'rejected');
  assert.equal(rejected.length, 2);
  assert.ok(rejected.every(result => result.reason.status === 503));
  assert.match(await hashPassword('queue-recovers'), /^scrypt\$/);
});

test('API overload returns retry guidance and recovers when queued work finishes', async t => {
  const db = sqliteDatabase(':memory:');
  let blocked = false, waiting = 0, release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  const tracked = { ...db, prepare(sql) {
    const statement = db.prepare(sql);
    return { ...statement, async get(...args) {
      if (blocked && sql.startsWith('SELECT s.csrf')) {
        if (++waiting === 256) entered();
        await hold;
      }
      return statement.get(...args);
    } };
  } };
  const app = await createApp({ database: tracked, tmdbToken: '', tmdbKey: '' }); t.after(app.close);
  const request = { url: '/api/session', method: 'GET', headers: { cookie: `final_take_session=${'a'.repeat(64)}` } };
  const response = () => ({ headers: {}, setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(value) { this.value = JSON.parse(value); } });
  blocked = true;
  const running = Array.from({ length: 256 }, () => app.handler(request, response()));
  await ready;
  const busy = response(); await app.handler(request, busy);
  assert.equal(busy.status, 503);
  assert.equal(busy.headers['Retry-After'], '5');
  assert.equal(busy.headers['Cache-Control'], 'no-store');
  blocked = false; release(); await Promise.all(running);
  const recovered = response(); await app.handler(request, recovered);
  assert.equal(recovered.status, 200);
});
