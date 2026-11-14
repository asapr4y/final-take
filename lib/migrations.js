import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { seedFilms } from './seed.js';

export async function migrateDatabase(db) {
  if (db.kind !== 'postgres') throw new Error('Cloud migrations require a PostgreSQL database.');
  const directory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  const files = (await readdir(directory)).filter(name => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
  const applied = [];
  await db.transaction(async tx => {
    // Transaction-scoped locks work with Supabase's transaction pooler.
    await tx.exec('SELECT pg_advisory_xact_lock(628154101)');
    await tx.exec(`CREATE SCHEMA IF NOT EXISTS final_take;
      CREATE TABLE IF NOT EXISTS final_take.schema_migrations (
        name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    for (const name of files) {
      const sql = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await tx.prepare('SELECT checksum FROM final_take.schema_migrations WHERE name = ?').get(name);
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Applied migration ${name} has changed. Add a new migration instead.`);
        continue;
      }
      await tx.exec(sql);
      await tx.prepare('INSERT INTO final_take.schema_migrations(name, checksum) VALUES (?, ?)').run(name, checksum);
      applied.push(name);
    }
    await tx.prepare('INSERT INTO films(id, json, cached_at) VALUES ' + seedFilms.map(() => '(?, ?, ?)').join(', ') + ' ON CONFLICT(id) DO NOTHING')
      .run(...seedFilms.flatMap(film => [film.id, JSON.stringify(film), Date.now()]));
  });
  return applied;
}
