const columnsByTable = {
  users: ['id', 'username', 'email', 'name', 'password_hash', 'bio', 'created_at'],
  films: ['id', 'json', 'cached_at'],
  entries: ['id', 'user_id', 'film_id', 'rating', 'review', 'watched_on', 'spoilers', 'created_at', 'updated_at'],
  watchlist: ['user_id', 'film_id', 'created_at'],
  favorites: ['user_id', 'film_id', 'created_at']
};

export async function readSQLiteSource(path) {
  const { DatabaseSync } = await import('node:sqlite');
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    source.exec('BEGIN');
    const rows = Object.fromEntries(Object.keys(columnsByTable).map(table => [table, source.prepare(`SELECT * FROM ${table}`).all()]));
    source.exec('COMMIT');
    return rows;
  } finally { source.close(); }
}

export async function importRows(target, rows) {
  return target.transaction(async tx => {
    let imported = 0;
    for (const [table, columns] of Object.entries(columnsByTable)) {
      const key = ['watchlist', 'favorites'].includes(table) ? 'user_id, film_id' : 'id';
      for (const row of rows[table] || []) {
        const result = await tx.prepare(`INSERT INTO ${table}(${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(${key}) DO NOTHING`)
          .run(...columns.map(column => row[column]));
        imported += result.changes;
      }
    }
    return imported;
  });
}
