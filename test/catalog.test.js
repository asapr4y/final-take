import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog } from '../lib/catalog.js';
import { sqliteDatabase } from '../lib/sqlite.js';

const movie = (id = 900001) => ({ id, title: `Discovery ${id}`, release_date: '2026-01-01', poster_path: '/poster.jpg', genre_ids: [18] });
const response = data => ({ ok: true, json: async () => data });
const page = films => ({ results: films, total_pages: 4 });
async function fixture(t, options) {
  const db = sqliteDatabase(':memory:'); t.after(() => db.close());
  const queries = [];
  const tracked = { ...db, prepare(sql) {
    const statement = db.prepare(sql);
    return Object.fromEntries(['get', 'all', 'run'].map(method => [method, (...args) => {
      queries.push(sql); return statement[method](...args);
    }]));
  } };
  const catalog = await createCatalog(tracked, { tmdbToken: 'test-only-token', ...options });
  queries.length = 0;
  return { db, catalog, queries };
}

test('a discovery page uses two database operations and concurrent/repeated requests reuse it', async t => {
  const calls = [];
  const { catalog, queries } = await fixture(t, { fetcher: async url => {
    calls.push(new URL(url)); return response(page(Array.from({ length: 20 }, (_, i) => movie(900001 + i))));
  } });
  const results = await Promise.all([catalog.list(), catalog.list(), catalog.list()]);
  assert.equal(calls.length, 1);
  assert.equal(queries.length, 2, 'one batch read and one batch insert for twenty films');
  assert.equal(results[0].films.length, 20);
  await catalog.list();
  assert.equal(calls.length, 1); assert.equal(queries.length, 2);
  await catalog.list({ query: 'different', genre: '18', page: 2 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].pathname, '/3/search/movie');
  assert.equal(calls[1].searchParams.get('query'), 'different');
  assert.equal(calls[1].searchParams.get('page'), '2');
  assert.equal(queries.length, 3, 'existing films do not need rewriting');
});

test('complete details without a runtime are cached and list refreshes do not reset their age', async t => {
  let clock = 1700000000000, details = 0;
  const { catalog, db } = await fixture(t, { now: () => clock, fetcher: async url => {
    if (new URL(url).pathname === '/3/movie/900001') {
      details++;
      return response({ ...movie(), runtime: null, genres: [{ name: 'Drama' }], credits: { crew: [{ job: 'Director', name: 'The Director' }] } });
    }
    return response(page([movie()]));
  } });
  const films = await Promise.all([catalog.get(900001), catalog.get(900001)]);
  assert.equal(details, 1); assert.equal(films[0].runtime, null);
  assert.equal('_detailsComplete' in films[0], false);
  await catalog.get(900001); assert.equal(details, 1);
  const original = await db.prepare('SELECT cached_at FROM films WHERE id = ?').get(900001);
  clock += 6 * 60000;
  const list = await catalog.list();
  assert.equal(list.films[0].director, 'The Director');
  assert.equal('_detailsComplete' in list.films[0], false);
  assert.equal((await db.prepare('SELECT cached_at FROM films WHERE id = ?').get(900001)).cached_at, original.cached_at);
  clock = original.cached_at + 86400001;
  await catalog.get(900001); assert.equal(details, 2, 'old details refresh after one day');
});

test('expired pages refresh, retain the last good result during outages, and recover after backoff', async t => {
  let clock = 1700000000000, calls = 0, unavailable = false;
  const { catalog } = await fixture(t, { now: () => clock, fetcher: async () => {
    calls++;
    if (unavailable) throw new Error('Upstream is unavailable');
    return response(page([movie(900000 + calls)]));
  } });
  const first = await catalog.list();
  clock += 5 * 60000 + 1; unavailable = true;
  assert.deepEqual(await catalog.list(), first);
  assert.equal((await catalog.list({ query: 'another query' })).expanded, false);
  assert.equal(calls, 2, 'cooldown avoids another slow upstream request');
  clock += 30001; unavailable = false;
  const recovered = await catalog.list();
  assert.equal(calls, 3); assert.equal(recovered.films[0].id, 900003);
  clock += 3600001; unavailable = true;
  assert.equal((await catalog.list()).expanded, false, 'stale results have a bounded lifetime');
});

test('slow upstream requests abort, fall back, and do not immediately retry', async t => {
  let calls = 0, requestSignal;
  const hold = setTimeout(() => {}, 1000); t.after(() => clearTimeout(hold));
  const { catalog } = await fixture(t, { requestTimeoutMs: 20, fetcher: async (url, { signal }) => {
    calls++; requestSignal = signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const result = await catalog.list();
  assert.equal(result.expanded, false); assert.equal(requestSignal.aborted, true);
  assert.ok(result.films.length > 0);
  await catalog.list({ genre: '18' }); assert.equal(calls, 1);
});

test('missing movies remain 404s and original backdrops are capped in public responses', async t => {
  const { catalog } = await fixture(t, { fetcher: async () => ({ ok: false, status: 404 }) });
  assert.equal(await catalog.get(9999999), null);
  const film = await catalog.get(693134);
  assert.match(film.backdrop, /\/w1280\//);
});
