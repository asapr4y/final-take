import { parseArgs } from 'node:util';
import { openDatabase, connectionStringFromEnv } from '../lib/database.js';
import { migrateDatabase } from '../lib/migrations.js';
import { readSQLiteSource, importRows } from '../lib/import.js';

const { values } = parseArgs({ options: { source: { type: 'string' }, apply: { type: 'boolean', default: false } } });
if (!values.source) throw new Error('Usage: npm run db:import -- --source ./data/final-take.sqlite [--apply]');
let target;
try {
  const rows = await readSQLiteSource(values.source);
  console.log('Source row counts:', Object.fromEntries(Object.entries(rows).map(([table, values]) => [table, values.length])));
  if (!values.apply) console.log('Dry run only. Add --apply to import. The source database is never modified.');
  else {
    const connectionString = process.env.MIGRATION_DATABASE_URL || connectionStringFromEnv();
    if (!connectionString) throw new Error('DATABASE_URL is required to import into Supabase.');
    target = await openDatabase(undefined, { connectionString, hosted: true });
    await migrateDatabase(target);
    await importRows(target, rows);
    console.log('Import complete. User IDs and password hashes were preserved; existing destination rows were left unchanged. Sign in again to create a new session.');
  }
} catch (error) {
  console.error('Import failed:', error.code || error.name, error.message);
  process.exitCode = 1;
} finally { if (target) await target.close(); }
