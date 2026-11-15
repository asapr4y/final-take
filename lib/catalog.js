import { seedFilms } from './seed.js';
import { createHash } from 'node:crypto';

const image = (path, size) => path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
const genreNames = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 18: 'Drama', 14: 'Fantasy', 27: 'Horror', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 53: 'Thriller', 99: 'Documentary' };
const publicFilm = ({ _detailsComplete, ...film }) => ({ ...film,
  // Old starter/imported records may point at multi-megabyte original artwork.
  backdrop: film.backdrop?.replace('https://image.tmdb.org/t/p/original/', 'https://image.tmdb.org/t/p/w1280/') || ''
});
const listLifetime = 5 * 60000, staleLifetime = 60 * 60000, retryDelay = 30000;

export async function createCatalog(db, { tmdbToken = '', tmdbKey = '', fetcher = fetch, now = Date.now, requestTimeoutMs = 4000 } = {}) {
  const lists = new Map(), pendingLists = new Map(), pendingDetails = new Map();
  let retryAfter = 0, activeRequests = 0, cleanupAfter = 0;
  const recentRequests = [];
  const remember = async film => {
    await db.prepare('INSERT INTO films(id, json, cached_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, cached_at = excluded.cached_at')
      .run(film.id, JSON.stringify(film), now());
    return publicFilm(film);
  };
  await db.prepare('INSERT INTO films(id, json, cached_at) VALUES ' + seedFilms.map(() => '(?, ?, ?)').join(', ') + ' ON CONFLICT(id) DO NOTHING')
    .run(...seedFilms.flatMap(film => [film.id, JSON.stringify(film), now()]));
  const convert = movie => ({
    id: movie.id, title: movie.title || movie.original_title, year: (movie.release_date || '').slice(0, 4),
    poster: image(movie.poster_path, 'w500'), backdrop: image(movie.backdrop_path, 'w1280'),
    overview: movie.overview || 'An overview has not been added for this film yet.',
    genres: movie.genres?.map(g => g.name) || (movie.genre_ids || []).map(id => genreNames[id]).filter(Boolean),
    runtime: movie.runtime || null, director: movie.credits?.crew?.find(x => x.job === 'Director')?.name || '',
    tagline: movie.tagline || '', language: movie.original_language || '',
    logo: image((movie.images?.logos || []).find(x => x.iso_639_1 === 'en')?.file_path, 'w500')
  });
  const tmdb = async (path, params = {}) => {
    if (now() < retryAfter) throw new Error('Movie catalog is temporarily unavailable.');
    while (recentRequests.length && recentRequests[0] <= now() - 1000) recentRequests.shift();
    if (activeRequests >= 4 || recentRequests.length >= 20) throw new Error('Movie catalog is busy.');
    activeRequests++; recentRequests.push(now());
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    url.search = new URLSearchParams({ language: 'en-US', include_adult: 'false', ...params });
    if (tmdbKey) url.searchParams.set('api_key', tmdbKey);
    try {
      const response = await fetcher(url, { headers: tmdbToken ? { Authorization: `Bearer ${tmdbToken}` } : {}, signal: AbortSignal.timeout(requestTimeoutMs) });
      if (!response.ok) {
        if (response.status === 429) {
          const header = response.headers?.get('retry-after');
          const delay = /^\d+$/.test(header || '') ? Number(header) * 1000 : Date.parse(header) - now();
          retryAfter = now() + Math.min(300000, Math.max(retryDelay, Number.isFinite(delay) ? delay : retryDelay));
        }
        throw Object.assign(new Error('Movie catalog is temporarily unavailable.'), { status: response.status });
      }
      return await response.json();
    } catch (error) {
      if (!error.status || [401, 403, 429].includes(error.status) || error.status >= 500) retryAfter = Math.max(retryAfter, now() + retryDelay);
      throw error;
    } finally { activeRequests--; }
  };
  const starterList = ({ query, genre, sort, page }) => {
    let films = seedFilms.filter(film => `${film.title} ${film.director} ${film.year}`.toLowerCase().includes(query.toLowerCase()));
    if (genre) films = films.filter(f => f.genres.includes(genreNames[Number(genre)]));
    if (sort === 'newest') films.sort((a, b) => Number(b.year) - Number(a.year));
    if (sort === 'title') films.sort((a, b) => a.title.localeCompare(b.title));
    return { films: films.slice((page - 1) * 24, page * 24).map(publicFilm), page, totalPages: Math.max(1, Math.ceil(films.length / 24)), expanded: false };
  };
  const loadList = async (options, cached) => {
    const { query, genre, sort, page } = options;
    if (tmdbToken || tmdbKey) {
      try {
        const result = await tmdb(query ? '/search/movie' : '/discover/movie', query
          ? { query, page: String(page) }
          : { page: String(page), sort_by: sort === 'newest' ? 'primary_release_date.desc' : sort === 'title' ? 'title.asc' : 'popularity.desc',
              'vote_count.gte': '100', ...(genre ? { with_genres: genre } : {}) });
        const movies = result.results.filter(m => m.poster_path && !m.adult && (!query || !genre || m.genre_ids?.includes(Number(genre))));
        const discovered = [...new Map(movies.map(movie => [movie.id, convert(movie)])).values()];
        let films = [];
        if (discovered.length) {
          // Two database round trips for the entire page, rather than a read/write per film.
          const rows = await db.prepare(`SELECT id, json FROM films WHERE id IN (${discovered.map(() => '?').join(', ')})`).all(...discovered.map(f => f.id));
          const existing = new Map(rows.map(row => [Number(row.id), JSON.parse(row.json)]));
          const missing = discovered.filter(film => !existing.has(film.id));
          if (missing.length) await db.prepare('INSERT INTO films(id, json, cached_at) VALUES ' + missing.map(() => '(?, ?, ?)').join(', ') + ' ON CONFLICT(id) DO NOTHING')
            .run(...missing.flatMap(film => [film.id, JSON.stringify(film), now()]));
          // Listing a film must not extend the lifetime of its cached complete details.
          films = discovered.map(film => publicFilm({ ...film, ...existing.get(film.id) }));
        }
        return { films, page, totalPages: Math.min(result.total_pages, 500), expanded: true };
      } catch { /* Reuse the last good page during an upstream outage. */ }
    }
    if (cached?.value.expanded && now() - cached.storedAt < staleLifetime) return cached.value;
    return starterList(options);
  };
  return {
    async list({ query = '', genre = '', sort = 'popular', page = 1 } = {}) {
      const options = { query, genre, sort, page }, key = JSON.stringify(options);
      let cached = lists.get(key);
      if (cached && now() < cached.expiresAt) return cached.value;
      if (pendingLists.has(key)) return pendingLists.get(key);
      if (pendingLists.size >= 100) return starterList(options);
      const pending = (async () => {
        const cacheKey = createHash('sha256').update(key).digest('hex');
        if ((tmdbToken || tmdbKey) && !cached) {
          const row = await db.prepare('SELECT json, cached_at FROM catalog_cache WHERE key = ? AND cached_at > ?').get(cacheKey, now() - staleLifetime);
          if (row) cached = { value: JSON.parse(row.json), storedAt: row.cached_at, expiresAt: row.cached_at + listLifetime };
        }
        const fresh = cached && now() < cached.expiresAt;
        const value = fresh ? cached.value : await loadList(options, cached);
        if (value.expanded && value !== cached?.value) {
          await db.prepare('INSERT INTO catalog_cache(key, json, cached_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, cached_at = excluded.cached_at')
            .run(cacheKey, JSON.stringify(value), now());
          if (now() >= cleanupAfter) {
            cleanupAfter = now() + 60000;
            await db.prepare('DELETE FROM catalog_cache WHERE key IN (SELECT key FROM catalog_cache WHERE cached_at <= ? ORDER BY cached_at LIMIT 500)').run(now() - staleLifetime);
          }
        }
        lists.delete(key);
        if (lists.size >= 100) lists.delete(lists.keys().next().value);
        // A failed refresh gets a short retry window, without making old data fresh again.
        const reused = value === cached?.value;
        lists.set(key, { value, storedAt: reused ? cached.storedAt : now(), expiresAt: fresh ? cached.expiresAt : now() + (value.expanded && !reused ? listLifetime : retryDelay) });
        return value;
      })().finally(() => pendingLists.delete(key));
      pendingLists.set(key, pending);
      return pending;
    },
    async get(id) {
      if (pendingDetails.has(id)) return pendingDetails.get(id);
      if (pendingDetails.size >= 100) throw Object.assign(new Error('Movie catalog is busy. Please try again shortly.'), { status: 503 });
      const pending = (async () => {
        const row = await db.prepare('SELECT json, cached_at FROM films WHERE id = ?').get(id);
        const cached = row ? JSON.parse(row.json) : null;
        const complete = cached && (cached._detailsComplete || cached.runtime);
        if ((tmdbToken || tmdbKey) && (!complete || now() - row.cached_at > 86400000)) {
          try { return await remember({ ...convert(await tmdb(`/movie/${id}`, { append_to_response: 'credits,images', include_image_language: 'en,null' })), _detailsComplete: true }); }
          catch (error) {
            if (!cached && error.status === 404) return null;
            if (!cached) throw Object.assign(new Error('This film could not be loaded. Try again shortly.'), { status: 503 });
          }
        }
        return cached ? publicFilm(cached) : null;
      })().finally(() => pendingDetails.delete(id));
      pendingDetails.set(id, pending);
      return pending;
    }
  };
}
