import { PGlite } from '@electric-sql/pglite';
import { postgresDatabase } from '../lib/database.js';

export async function testPostgres() {
  const engine = new PGlite();
  await engine.waitReady;
  const clientFor = connection => ({
    async unsafe(sql, args = []) {
      const result = args.length ? await connection.query(sql, args) : (await connection.exec(sql)).at(-1) || { rows: [] };
      const rows = result.rows || [];
      rows.count = result.affectedRows ?? rows.length;
      return rows;
    },
    begin: action => engine.transaction(tx => action(clientFor(tx))),
    end: () => engine.close()
  });
  const client = clientFor(engine);
  return { engine, client, db: postgresDatabase(client) };
}
