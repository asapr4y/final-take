// Isolated local load smoke. Never loads .env or connects to the hosted database.
import { performance } from 'node:perf_hooks';
import { createApp } from '../server.js';
import { startSession } from '../lib/auth.js';

const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const stages = argument('users', '25,50,100,200').split(',').map(Number);
const iterations = Number(argument('iterations', '12'));
if (stages.some(value => !Number.isInteger(value) || value < 1 || value > 500) || !Number.isInteger(iterations) || iterations < 1 || iterations > 100) {
  throw new Error('Use --users=25,50,100,200 (1-500 each) and --iterations=12 (1-100).');
}
const app = await createApp({ databasePath: ':memory:', connectionString: '', hosted: false, tmdbToken: '', tmdbKey: '' });
try {
  const date = new Date().toISOString(), clients = [];
  const films = await app.db.prepare('SELECT id FROM films ORDER BY id').all();
  for (let i = 0; i < 25; i++) {
    const id = `load-user-${i}`;
    await app.db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, id, `${id}@example.invalid`, 'Load Test', 'unused-no-login', '', date);
    const user = await app.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    let cookie;
    const session = await startSession(app.db, { setHeader: (name, value) => { cookie = value.split(';')[0]; } }, user);
    clients.push({ cookie, csrf: session.csrf });
    const entries = Array.from({ length: 100 }, (_, j) => [`load-${i}-${j}`, id, films[j % films.length].id, 4.5, 'Synthetic load-test review.', '2026-01-20', 0, date, date]);
    await app.db.prepare(`INSERT INTO entries VALUES ${entries.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`).run(...entries.flat());
    await app.db.prepare(`INSERT INTO watchlist VALUES ${films.map(() => '(?, ?, ?)').join(', ')}`).run(...films.flatMap(film => [id, film.id, date]));
  }
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const paths = ['/api/session', '/api/films', `/api/films/${films[0].id}`, '/api/me/diary', '/api/me/watchlist', `/api/watchlist/${films[0].id}`];
  console.log('LOCAL SQLITE SMOKE TEST: 25 accounts, 2,500 diary entries; excludes cloud latency, TMDB, CDN, images, and login hashing.');
  console.log('Users\tRequests\tErrors\tReq/s\tp50 ms\tp95 ms');
  let errorsTotal = 0;
  for (const users of stages) {
    const times = []; let errors = 0;
    const started = performance.now();
    await Promise.all(Array.from({ length: users }, async (_, i) => {
      const { cookie, csrf } = clients[i % clients.length];
      for (let j = 0; j < iterations; j++) {
        const index = (i + j) % paths.length, before = performance.now();
        try {
          const response = await fetch(origin + paths[index], { method: index === 5 ? 'PUT' : 'GET',
            headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': csrf }, signal: AbortSignal.timeout(30000) });
          const value = await response.json();
          if (!response.ok || value.error) errors++;
        } catch { errors++; }
        times.push(performance.now() - before);
      }
    }));
    const seconds = (performance.now() - started) / 1000;
    times.sort((a, b) => a - b);
    const percentile = p => times[Math.max(0, Math.ceil(times.length * p) - 1)].toFixed(1);
    console.log(`${users}\t${times.length}\t${errors}\t${(times.length / seconds).toFixed(1)}\t${percentile(.5)}\t${percentile(.95)}`);
    errorsTotal += errors;
  }
  if (errorsTotal) process.exitCode = 1;
} finally { await app.close(); }
