import { openDatabase, connectionStringFromEnv } from '../lib/database.js';
import { migrateDatabase } from '../lib/migrations.js';

const connectionString = process.env.MIGRATION_DATABASE_URL || connectionStringFromEnv();
if (!connectionString) {
  console.error('Set DATABASE_URL to your Supabase transaction-pooler connection string before running this command.');
  process.exitCode = 1;
} else {
  let db;
  try {
    db = await openDatabase(undefined, { connectionString, hosted: true });
    const applied = await migrateDatabase(db);
    console.log(applied.length ? `Applied ${applied.length} database migration(s): ${applied.join(', ')}` : 'Database schema is already up to date.');
    console.log('The starter film catalog is available. Existing accounts and diary data were preserved.');
  } catch (error) {
    console.error('Database migration failed:', error.code || error.name, error.message);
    process.exitCode = 1;
  } finally { if (db) await db.close(); }
}
