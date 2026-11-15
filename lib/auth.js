import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { publicUser } from './database.js';

const scrypt = promisify(scryptCallback);
const options = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 };
const hashToken = token => createHash('sha256').update(token).digest('hex');
const cookieName = 'final_take_session';
const duration = 7 * 24 * 60 * 60;
let activeHashes = 0;
const hashQueue = [];

async function passwordHash(password, salt) {
  // scrypt uses about 64 MiB per operation. Bound both memory use and queued work.
  if (activeHashes >= 2) {
    if (hashQueue.length >= 8) throw Object.assign(new Error('Sign in is busy. Please try again shortly.'), { status: 503 });
    await new Promise(resolve => hashQueue.push(resolve));
  } else activeHashes++;
  try { return await scrypt(password, salt, 64, options); }
  finally {
    const next = hashQueue.shift();
    if (next) next(); else activeHashes--;
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await passwordHash(password, salt);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const [, salt, stored] = String(encoded || '').split('$');
  // Do the expensive operation even when the account doesn't exist.
  const actual = await passwordHash(password, salt || 'no-account-timing-salt');
  const expected = Buffer.from(stored || '00'.repeat(64), 'hex');
  return Boolean(stored) && actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function sessionFor(db, request) {
  const token = String(request.headers.cookie || '').split(';').map(x => x.trim())
    .find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await db.prepare(`SELECT s.csrf, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(hashToken(token), Date.now());
  return row ? { user: publicUser(row), csrf: row.csrf, token } : null;
}

export async function startSession(db, response, user, secure = false) {
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(24).toString('hex');
  await db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(hashToken(token), user.id, csrf, Date.now() + duration * 1000);
  response.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${duration}${secure ? '; Secure' : ''}`);
  return { user: publicUser(user), csrf };
}

export async function endSession(db, response, session, secure = false) {
  if (session) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(session.token));
  response.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`);
}
