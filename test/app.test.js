import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { createApp } from '../server.js';

async function start(databasePath = ':memory:') {
  const app = await createApp({ databasePath, tmdbToken: '', tmdbKey: '', connectionString: '', hosted: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const client = () => {
    let cookie = '', csrf = '';
    return {
      async request(path, method = 'GET', data, overrides = {}) {
        const response = await fetch(origin + path, { method,
          headers: { Origin: origin, Cookie: cookie, ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...overrides },
          ...(data !== undefined ? { body: typeof data === 'string' ? data : JSON.stringify(data) } : {}) });
        const value = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
        const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
        if (value.csrf) csrf = value.csrf;
        return { status: response.status, value, headers: response.headers };
      },
      get cookie() { return cookie; }
    };
  };
  return { ...app, client, origin };
}
const registration = username => ({ name: username === 'alice' ? 'Alice Rivera' : 'Bob Santos', username, email: `${username}@example.com`, password: 'a-long-good-password-42' });
const viewing = (extra = {}) => ({ filmId: 693134, rating: 4.5, review: 'A desert, a prophecy, and a lingering feeling.', watchedOn: '2026-01-20', spoilers: false, ...extra });

test('real accounts, private sessions, and logout', async t => {
  const app = await start(); t.after(app.close); const alice = app.client();
  const result = await alice.request('/api/auth/register', 'POST', registration('alice'));
  assert.equal(result.status, 201); assert.equal(result.value.user.username, 'alice');
  assert.match(result.headers.get('set-cookie'), /HttpOnly/); assert.match(result.headers.get('set-cookie'), /SameSite=Lax/);
  assert.ok(result.value.csrf); assert.ok(!('email' in result.value.user)); assert.ok(!('password_hash' in result.value.user));
  assert.equal((await alice.request('/api/session')).value.user.name, 'Alice Rivera');
  assert.equal((await alice.request('/api/auth/logout', 'POST')).status, 200);
  assert.equal((await alice.request('/api/me/diary')).status, 401);
  assert.equal((await alice.request('/api/auth/login', 'POST', { email: 'alice', password: 'bad' })).status, 401);
  assert.equal((await alice.request('/api/auth/login', 'POST', { email: 'ALICE@EXAMPLE.COM', password: registration('alice').password })).status, 200);
});

test('diary CRUD, rewatches, public reviews, and account isolation', async t => {
  const app = await start(); t.after(app.close); const alice = app.client(), bob = app.client();
  await alice.request('/api/auth/register', 'POST', registration('alice')); await bob.request('/api/auth/register', 'POST', registration('bob'));
  const first = await alice.request('/api/entries', 'POST', viewing()); assert.equal(first.status, 201);
  assert.equal(first.value.firstEntry, true); assert.equal(first.value.rewatch, false);
  const second = await alice.request('/api/entries', 'POST', viewing({ watchedOn: '2026-02-20', rating: 5, review: 'Even better the second time. ♥' }));
  assert.equal(second.status, 201); assert.equal((await alice.request('/api/me/diary')).value.entries.length, 2);
  assert.equal(second.value.firstEntry, false); assert.equal(second.value.rewatch, true);
  assert.equal((await bob.request('/api/me/diary')).value.entries.length, 0);
  assert.equal((await bob.request(`/api/entries/${first.value.id}`, 'DELETE')).status, 404);
  assert.equal((await bob.request(`/api/entries/${first.value.id}`, 'PATCH', viewing())).status, 404);
  assert.equal((await alice.request(`/api/entries/${first.value.id}`, 'PATCH', viewing({ rating: 3.5, review: 'A revised take.', spoilers: true }))).status, 200);
  const detail = await bob.request('/api/films/693134'); assert.equal(detail.value.reviews.length, 2); assert.equal(detail.value.aggregate.average, 4.3);
  const profile = await bob.request('/api/members/alice'); assert.equal(profile.value.stats.entries, 2); assert.equal(profile.value.stats.films, 1); assert.equal(profile.value.stats.reviews, 2);
  assert.equal((await alice.request(`/api/entries/${second.value.id}`, 'DELETE')).status, 200);
  assert.equal((await alice.request('/api/me/diary')).value.entries.length, 1);
});

test('watchlists are idempotent, personal, and removable; favorites are capped at four', async t => {
  const app = await start(); t.after(app.close); const alice = app.client(), guest = app.client();
  await alice.request('/api/auth/register', 'POST', registration('alice'));
  assert.equal((await guest.request('/api/watchlist/693134', 'PUT')).status, 401);
  await alice.request('/api/watchlist/693134', 'PUT'); await alice.request('/api/watchlist/693134', 'PUT');
  assert.equal((await alice.request('/api/me/watchlist')).value.films.length, 1);
  await alice.request('/api/watchlist/693134', 'DELETE'); assert.equal((await alice.request('/api/me/watchlist')).value.films.length, 0);
  for (const id of [693134, 27205, 438631, 155]) assert.equal((await alice.request(`/api/favorites/${id}`, 'PUT')).status, 200);
  assert.equal((await alice.request('/api/favorites/157336', 'PUT')).status, 400);
  await alice.request('/api/favorites/155', 'DELETE'); assert.equal((await alice.request('/api/favorites/157336', 'PUT')).status, 200);
  assert.equal((await guest.request('/api/members/alice')).value.favorites.length, 4);
});

test('CSRF, malformed input, invalid ratings and dates, and duplicate registration are rejected', async t => {
  const app = await start(); t.after(app.close); const alice = app.client();
  await alice.request('/api/auth/register', 'POST', registration('alice'));
  assert.equal((await alice.request('/api/entries', 'POST', viewing(), { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await alice.request('/api/entries', 'POST', viewing(), { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await alice.request('/api/entries', 'POST', viewing({ rating: 4.2 }))).status, 400);
  assert.equal((await alice.request('/api/entries', 'POST', viewing({ watchedOn: '2026-02-30' }))).status, 400);
  assert.equal((await alice.request('/api/entries', 'POST', viewing({ review: 'x'.repeat(5001) }))).status, 400);
  assert.equal((await alice.request('/api/entries', 'POST', '{bad json')).status, 400);
  assert.equal((await alice.request('/api/auth/register', 'POST', registration('alice'))).status, 409);
  const profile = await alice.request('/api/me/profile', 'PATCH', { name: '<script>test</script>', bio: 'A diary, not HTML.' });
  assert.equal(profile.status, 200); assert.equal(profile.value.user.bio, 'A diary, not HTML.');
  assert.equal((await alice.request('/.env')).status, 200); // SPA fallback never exposes environment files.
  assert.ok(!(await alice.request('/.env')).value.includes('TMDB_READ_TOKEN='));
});

test('starter discovery works without credentials and production assets have security headers', async t => {
  const app = await start(); t.after(app.close); const guest = app.client();
  const result = await guest.request('/api/films'); assert.ok(result.value.films.length >= 12);
  const search = await guest.request('/api/films?q=interstellar'); assert.equal(search.value.films[0].title, 'Interstellar');
  const genre = await guest.request('/api/films?genre=16'); assert.ok(genre.value.films.every(film => film.genres.includes('Animation')));
  assert.equal((await guest.request('/api/films/999999999')).status, 404);
  const index = await guest.request('/'); assert.equal(index.status, 200); assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const source = await guest.request('/app.js'); assert.equal(source.status, 200); assert.match(source.headers.get('content-type'), /javascript/);
  for (const asset of ['/wordmark.svg', '/wordmark-stacked.svg', '/cinema-sign.svg']) {
    const response = await guest.request(asset);
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(response.value, /<svg/);
  }
  const marquee = await guest.request('/cinema-marquee.jpeg');
  assert.equal(marquee.status, 200); assert.match(marquee.headers.get('content-type'), /image\/jpeg/);
  const city = await guest.request('/city-scene.js');
  assert.equal(city.status, 200); assert.match(city.headers.get('content-type'), /javascript/);
  assert.match(city.value, /export function renderCityScene/);
});

test('diary and login sessions persist after an application restart', async () => {
  const path = join(tmpdir(), `final-take-test-${randomUUID()}.sqlite`);
  let app;
  try {
    app = await start(path); const alice = app.client(); await alice.request('/api/auth/register', 'POST', registration('alice'));
    await alice.request('/api/entries', 'POST', viewing()); const cookie = alice.cookie;
    await app.close(); app = await start(path);
    const response = await fetch(app.origin + '/api/me/diary', { headers: { Cookie: cookie } });
    assert.equal(response.status, 200); assert.equal((await response.json()).entries.length, 1);
  } finally {
    if (app) await app.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) unlinkSync(path + suffix);
  }
});

test('live discovery keeps the token server-side, honors genre filters, and caches complete film details', async t => {
  const calls = [];
  const app = await createApp({ databasePath: ':memory:', connectionString: '', hosted: false, tmdbToken: 'server-only-test-token', fetcher: async (url, options) => {
    calls.push({ url: new URL(url), authorization: options.headers.Authorization });
    const film = { id: 900001, title: 'A New Discovery', release_date: '2025-05-01', poster_path: '/test-poster.jpg', genre_ids: [18],
      genres: [{ id: 18, name: 'Drama' }], runtime: 110, overview: 'A film for the test.',
      credits: { crew: [{ job: 'Director', name: 'A Director' }] } };
    return { ok: true, json: async () => String(url).includes('/movie/900001') ? film : { results: [film], total_pages: 1 } };
  } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); t.after(app.close);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const searchResponse = await fetch(origin + '/api/films?q=discovery&genre=18');
  assert.match(searchResponse.headers.get('cache-control'), /public.*s-maxage=300/);
  assert.equal(searchResponse.headers.get('set-cookie'), null);
  const search = await searchResponse.json();
  assert.equal(search.films[0].title, 'A New Discovery'); assert.ok(!JSON.stringify(search).includes('server-only-test-token'));
  assert.equal(calls[0].url.pathname, '/3/search/movie'); assert.equal(calls[0].authorization, 'Bearer server-only-test-token');
  const detailResponse = await fetch(origin + '/api/films/900001');
  assert.equal(detailResponse.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(origin + '/api/session')).headers.get('cache-control'), 'no-store');
  const detail = await detailResponse.json(); assert.equal(detail.film.director, 'A Director');
  const count = calls.length; await fetch(origin + '/api/films/900001'); assert.equal(calls.length, count);
  const filtered = await (await fetch(origin + '/api/films?q=discovery&genre=35')).json(); assert.equal(filtered.films.length, 0);
});
