import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
import { openDatabase, connectionStringFromEnv, publicUser, userStats, entryRows } from './lib/database.js';
import { hashPassword, verifyPassword, sessionFor, startSession, endSession } from './lib/auth.js';
import { createCatalog } from './lib/catalog.js';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const idValue = value => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) fail('Choose a valid film.'); return id; };
const text = (value, max, label, min = 0) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(`${label} must be ${min ? `${min}–` : 'at most '}${max} characters.`);
  return value.trim();
};
async function body(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) fail('Send JSON data.', 415);
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 20000) fail('This request is too large.', 413); chunks.push(chunk); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Invalid request.'); return data; }
  catch (error) { if (error.status) throw error; fail('Invalid JSON.'); }
}
function entryData(data) {
  const rating = Number(data.rating);
  if (!Number.isFinite(rating) || rating < .5 || rating > 5 || !Number.isInteger(rating * 2)) fail('Choose a rating from half a star to five stars.');
  const review = text(data.review ?? '', 5000, 'Your review');
  const watchedOn = String(data.watchedOn || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(watchedOn) || !Number.isFinite(Date.parse(watchedOn)) || new Date(watchedOn).toISOString().slice(0, 10) !== watchedOn) fail('Choose a valid watched date.');
  // A calendar date may be one UTC day ahead in the viewer's timezone.
  const today = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (watchedOn > today || watchedOn < '1888-01-01') fail('Choose a watched date between 1888 and today.');
  return { rating, review, watchedOn, spoilers: data.spoilers ? 1 : 0 };
}

export async function createApp({ databasePath = process.env.SQLITE_PATH || './data/final-take.sqlite', appOrigin = process.env.APP_ORIGIN || '',
  tmdbToken = process.env.TMDB_READ_TOKEN || '', tmdbKey = process.env.TMDB_API_KEY || '', fetcher, database, connectionString = connectionStringFromEnv(), hosted = Boolean(process.env.VERCEL) } = {}) {
  if (appOrigin) {
    const configured = new URL(appOrigin);
    if (!['http:', 'https:'].includes(configured.protocol)) throw new Error('APP_ORIGIN must be an HTTP or HTTPS origin.');
    appOrigin = configured.origin;
  }
  const db = database || await openDatabase(databasePath, { connectionString, hosted });
  let catalog;
  try { catalog = await createCatalog(db, { tmdbToken, tmdbKey, fetcher }); }
  catch (error) { if (!database) await db.close(); throw error; }
  async function throttle(request, action, limit) {
    const address = process.env.VERCEL
      ? String(request.headers['x-vercel-forwarded-for'] || request.headers['x-forwarded-for'] || request.socket.remoteAddress).split(',')[0].trim()
      : request.socket.remoteAddress;
    const key = createHash('sha256').update(`${action}:${address}`).digest('hex');
    const now = Date.now(), until = now + 15 * 60000;
    await db.prepare('DELETE FROM auth_attempts WHERE reset_at < ?').run(now - 15 * 60000);
    const value = await db.prepare(`INSERT INTO auth_attempts(key, count, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN auth_attempts.reset_at <= ? THEN 1 ELSE auth_attempts.count + 1 END,
      reset_at = CASE WHEN auth_attempts.reset_at <= ? THEN ? ELSE auth_attempts.reset_at END
      RETURNING count, reset_at`).get(key, until, now, now, until);
    if (value.count > limit) fail('Too many attempts. Please try again in 15 minutes.', 429);
  }
  const handler = async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://image.tmdb.org https://www.themoviedb.org data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const send = (data, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      const method = request.method;
      if (!path.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(method)) fail('Method not allowed.', 405);
        const allowed = { '/app.js': 'app.js', '/styles.css': 'styles.css', '/favicon.svg': 'favicon.svg', '/tmdb-logo.svg': 'tmdb-logo.svg' };
        const name = allowed[path] || (!extname(path) || path === '/index.html' ? 'index.html' : null);
        if (!name) fail('Page not found.', 404);
        const file = await readFile(resolve(publicDir, name));
        const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' }[extname(name)];
        response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' });
        return response.end(method === 'HEAD' ? undefined : file);
      }
      const session = await sessionFor(db, request);
      const secure = appOrigin.startsWith('https:') || Boolean(process.env.VERCEL);
      const requireUser = () => { if (!session) fail('Sign in to keep your film diary.', 401); return session.user; };
      if (!['GET', 'HEAD'].includes(method)) {
        const platformHost = process.env.VERCEL ? String(request.headers['x-forwarded-host'] || request.headers.host) : request.headers.host;
        const expectedOrigin = appOrigin || `${process.env.VERCEL ? 'https' : 'http'}://${platformHost}`;
        if (request.headers.origin !== expectedOrigin) fail('This request is not allowed.', 403);
        if (!['/api/auth/login', '/api/auth/register'].includes(path)) {
          requireUser();
          if (request.headers['x-csrf-token'] !== session.csrf) fail('Refresh the page and try again.', 403);
        }
      }
      if (path === '/api/session' && method === 'GET') return send({ user: session?.user || null, csrf: session?.csrf || null });
      if (path === '/api/auth/register' && method === 'POST') {
        await throttle(request, 'register', 8);
        const data = await body(request);
        const name = text(data.name, 50, 'Your name', 1);
        const username = text(data.username, 24, 'Username', 3).toLowerCase();
        if (!/^[a-z0-9_]+$/.test(username) || ['api', 'me', 'film', 'films', 'login', 'signup', 'settings'].includes(username)) fail('Use 3–24 letters, numbers, or underscores for your username.');
        const email = text(data.email, 254, 'Email', 3).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
        if (typeof data.password !== 'string' || data.password.length < 10 || data.password.length > 128) fail('Choose a password with 10–128 characters.');
        if (await db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username)) fail('That email or username is already in use.', 409);
        const hash = await hashPassword(data.password);
        const user = { id: randomUUID(), username, email, name, password_hash: hash, bio: '', created_at: new Date().toISOString() };
        try { await db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(user.id, username, email, name, hash, '', user.created_at); }
        catch (error) { if (error.code === '23505' || error.message.includes('UNIQUE constraint failed')) fail('That email or username is already in use.', 409); throw error; }
        return send(await startSession(db, response, user, secure), 201);
      }
      if (path === '/api/auth/login' && method === 'POST') {
        await throttle(request, 'login', 15);
        const data = await body(request);
        const identity = text(data.email, 254, 'Email or username', 1).toLowerCase();
        const password = typeof data.password === 'string' && data.password.length <= 128 ? data.password : '';
        const user = await db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(identity, identity);
        if (!await verifyPassword(password, user?.password_hash)) fail('The email, username, or password is incorrect.', 401);
        if (session) await endSession(db, response, session, secure);
        return send(await startSession(db, response, user, secure));
      }
      if (path === '/api/auth/logout' && method === 'POST') { await endSession(db, response, session, secure); return send({ ok: true }); }
      if (path === '/api/films' && method === 'GET') {
        const query = String(url.searchParams.get('q') || '').trim().slice(0, 100);
        const genre = String(url.searchParams.get('genre') || '').slice(0, 6);
        const page = Math.min(500, Math.max(1, Number(url.searchParams.get('page')) || 1));
        const sort = ['popular', 'newest', 'title'].includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'popular';
        return send(await catalog.list({ query, genre, sort, page: Math.floor(page) }));
      }
      const filmRoute = path.match(/^\/api\/films\/(\d+)$/);
      if (filmRoute && method === 'GET') {
        const film = await catalog.get(idValue(filmRoute[1])); if (!film) fail('Film not found.', 404);
        const reviews = await entryRows(db, 'e.film_id = ? AND e.review != ?', [film.id, '']);
        const aggregate = await db.prepare('SELECT ROUND(AVG(rating), 1) AS average, COUNT(*) AS count FROM entries WHERE film_id = ?').get(film.id);
        const my = session ? {
          watchlisted: Boolean(await db.prepare('SELECT 1 FROM watchlist WHERE user_id = ? AND film_id = ?').get(session.user.id, film.id)),
          favorite: Boolean(await db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND film_id = ?').get(session.user.id, film.id)),
          entries: await entryRows(db, 'e.user_id = ? AND e.film_id = ?', [session.user.id, film.id])
        } : null;
        return send({ film, reviews, aggregate, my });
      }
      if (path === '/api/me/diary' && method === 'GET') return send({ entries: await entryRows(db, 'e.user_id = ?', [requireUser().id]) });
      if (path === '/api/me/watchlist' && method === 'GET') {
        const films = (await db.prepare('SELECT f.json FROM watchlist w JOIN films f ON f.id = w.film_id WHERE w.user_id = ? ORDER BY w.created_at DESC').all(requireUser().id)).map(row => JSON.parse(row.json));
        return send({ films });
      }
      if (path === '/api/entries' && method === 'POST') {
        const user = requireUser(); const data = await body(request); const values = entryData(data);
        const film = await catalog.get(idValue(data.filmId)); if (!film) fail('Film not found.', 404);
        const id = randomUUID(), now = new Date().toISOString();
        await db.prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, user.id, film.id, values.rating, values.review, values.watchedOn, values.spoilers, now, now);
        return send({ id }, 201);
      }
      const entryRoute = path.match(/^\/api\/entries\/([a-f0-9-]+)$/);
      if (entryRoute && ['PATCH', 'DELETE'].includes(method)) {
        const user = requireUser();
        if (!await db.prepare('SELECT id FROM entries WHERE id = ? AND user_id = ?').get(entryRoute[1], user.id)) fail('Diary entry not found.', 404);
        if (method === 'DELETE') await db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(entryRoute[1], user.id);
        else {
          const values = entryData(await body(request));
          await db.prepare('UPDATE entries SET rating = ?, review = ?, watched_on = ?, spoilers = ?, updated_at = ? WHERE id = ? AND user_id = ?')
            .run(values.rating, values.review, values.watchedOn, values.spoilers, new Date().toISOString(), entryRoute[1], user.id);
        }
        return send({ ok: true });
      }
      const collection = path.match(/^\/api\/(watchlist|favorites)\/(\d+)$/);
      if (collection && ['PUT', 'DELETE'].includes(method)) {
        const user = requireUser(), id = idValue(collection[2]), table = collection[1];
        if (method === 'DELETE') await db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND film_id = ?`).run(user.id, id);
        else {
          const film = await catalog.get(id); if (!film) fail('Film not found.', 404);
          await db.transaction(async tx => {
            await tx.lockUser(user.id);
            if (table === 'favorites' && !await tx.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND film_id = ?').get(user.id, id) &&
                (await tx.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?').get(user.id)).n >= 4) fail('Your four favorites are full. Remove one to make room.');
            await tx.prepare(`INSERT INTO ${table} VALUES (?, ?, ?) ON CONFLICT(user_id, film_id) DO NOTHING`).run(user.id, id, new Date().toISOString());
          });
        }
        return send({ ok: true });
      }
      if (path === '/api/me/profile' && method === 'PATCH') {
        const user = requireUser(), data = await body(request);
        await db.prepare('UPDATE users SET name = ?, bio = ? WHERE id = ?').run(text(data.name, 50, 'Your name', 1), text(data.bio ?? '', 280, 'Your bio'), user.id);
        return send({ user: publicUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
      }
      const profileRoute = path.match(/^\/api\/members\/([a-zA-Z0-9_]+)$/);
      if (profileRoute && method === 'GET') {
        const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(profileRoute[1]); if (!user) fail('This profile could not be found.', 404);
        const favorites = (await db.prepare('SELECT f.json FROM favorites x JOIN films f ON f.id = x.film_id WHERE x.user_id = ? ORDER BY x.created_at').all(user.id)).map(row => JSON.parse(row.json));
        return send({ user: publicUser(user), stats: await userStats(db, user.id), favorites, entries: await entryRows(db, 'e.user_id = ?', [user.id]) });
      }
      fail('This page could not be found.', 404);
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error('Request failed:', error.message);
      if (!response.headersSent) send({ error: status === 500 ? 'Something went wrong. Please try again.' : error.message }, status);
      else response.end();
    }
  };
  const server = http.createServer(handler);
  let closing = false;
  return { handler, server, db, async close() { if (closing) return; closing = true; if (server.listening) await new Promise(resolve => server.close(resolve)); await db.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await createApp();
  const port = Number(process.env.PORT) || 3000, host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => console.log(`Final Take is running at http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
