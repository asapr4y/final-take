const invalid = () => { throw Object.assign(new Error('This page link is invalid. Please start from the first page.'), { status: 400 }); };

export function pageOptions(params, type = 'entries') {
  const value = params.get('limit');
  const limit = value === null ? 24 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
  const encoded = params.get('cursor');
  let cursor = null;
  if (encoded !== null) {
    if (!/^[A-Za-z0-9_-]{1,600}$/.test(encoded)) invalid();
    try { cursor = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { invalid(); }
    const validText = text => typeof text === 'string' && text.length > 0 && text.length <= 100;
    if (!Array.isArray(cursor) || (type === 'entries'
      ? cursor.length !== 3 || !cursor.every(validText)
      : cursor.length !== 2 || !validText(cursor[0]) || !Number.isSafeInteger(cursor[1]) || cursor[1] < 1 || cursor[1] > 2147483647)) invalid();
  }
  return { limit, cursor };
}

export function pageResult(rows, limit, key) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore ? Buffer.from(JSON.stringify(key(items.at(-1)))).toString('base64url') : null };
}
