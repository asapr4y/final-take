import postgres from 'postgres';

const tables = 'users|sessions|films|entries|watchlist|favorites|auth_attempts|catalog_cache';
const numericColumns = new Set(['count', 'n', 'average', 'rating', 'entries', 'films', 'reviews', 'watchlist', 'expires_at', 'cached_at', 'reset_at']);

export function connectionStringFromEnv(env = process.env) {
  return env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL || env.SUPABASE_DB_URL || '';
}

export function postgresSQL(sql) {
  let parameter = 0;
  // All identifiers are internal constants; user values always remain parameters.
  const qualified = sql.replace(new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+(${tables})\\b`, 'gi'), '$1 final_take.$2');
  return qualified.replace(/'(?:''|[^'])*'|\?/g, token => token === '?' ? `$${++parameter}` : token);
}
const normalize = row => row && Object.fromEntries(Object.entries(row).map(([key, value]) =>
  [key, typeof value === 'string' && numericColumns.has(key) ? Number(value) : value]));

export function postgresDatabase(client) {
  return {
    kind: 'postgres', client,
    prepare(sql) {
      const query = (...args) => client.unsafe(postgresSQL(sql), args);
      return {
        get: async (...args) => normalize((await query(...args))[0]),
        all: async (...args) => (await query(...args)).map(normalize),
        run: async (...args) => { const rows = await query(...args); return { changes: rows.count ?? rows.length }; }
      };
    },
    exec: sql => client.unsafe(sql),
    lockUser: async id => { await client.unsafe('SELECT id FROM final_take.users WHERE id = $1 FOR UPDATE', [id]); },
    transaction: action => client.begin(tx => action(postgresDatabase(tx))),
    close: () => client.end({ timeout: 5 })
  };
}

export async function openDatabase(path = './data/final-take.sqlite', { connectionString = connectionStringFromEnv(), hosted = Boolean(process.env.VERCEL), client, poolSize = process.env.DATABASE_POOL_SIZE || 2 } = {}) {
  if (client) return postgresDatabase(client);
  if (connectionString) {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
    if (url.hash) throw new Error('URL-encode special characters in the DATABASE_URL password.');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const max = Number(poolSize);
    if (!Number.isInteger(max) || max < 1 || max > 10) throw new Error('DATABASE_POOL_SIZE must be an integer from 1 to 10.');
    const sql = postgres(connectionString, { max, prepare: false, max_pipeline: 1,
      ssl: local ? false : 'require', connect_timeout: 10, idle_timeout: 20, max_lifetime: 600, onnotice: () => {} });
    return postgresDatabase(sql);
  }
  if (hosted) throw new Error('DATABASE_URL is required on Vercel. Connect the Supabase transaction pooler and run npm run db:migrate.');
  const { sqliteDatabase } = await import('./sqlite.js');
  return sqliteDatabase(path);
}

export function publicUser(row) {
  return row ? { id: row.id, username: row.username, name: row.name, bio: row.bio, joined: row.created_at } : null;
}

export async function userStats(db, userId) {
  const stats = await db.prepare(`SELECT COUNT(*) AS entries, COUNT(DISTINCT film_id) AS films,
    COALESCE(ROUND(AVG(rating), 1), 0) AS average,
    COALESCE(SUM(CASE WHEN review != '' THEN 1 ELSE 0 END), 0) AS reviews,
    (SELECT COUNT(*) FROM watchlist WHERE user_id = ?) AS watchlist
    FROM entries WHERE user_id = ?`).get(userId, userId);
  return stats;
}

export async function entryRows(db, where, args = [], { limit = 24, cursor = null, film = null } = {}) {
  const after = cursor ? ' AND (e.watched_on, e.created_at, e.id) < (?, ?, ?)' : '';
  return (await db.prepare(`SELECT e.*, ${film ? '' : 'f.json,'} u.username, u.name FROM entries e
    ${film ? '' : 'JOIN films f ON f.id = e.film_id'} JOIN users u ON u.id = e.user_id
    WHERE (${where})${after} ORDER BY e.watched_on DESC, e.created_at DESC, e.id DESC LIMIT ?`)
    .all(...args, ...(cursor || []), limit)).map(row => {
    const source = film || JSON.parse(row.json);
    return {
      id: row.id, userId: row.user_id, film: { id: source.id, title: source.title, year: source.year, poster: source.poster }, rating: row.rating,
      review: row.review, watchedOn: row.watched_on, spoilers: Boolean(row.spoilers),
      createdAt: row.created_at, username: row.username, name: row.name
    };
  });
}
