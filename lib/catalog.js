import { seedFilms } from './seed.js';

const image = (path, size) => path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
const genreNames = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 18: 'Drama', 14: 'Fantasy', 27: 'Horror', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 53: 'Thriller', 99: 'Documentary' };

export async function createCatalog(db, { tmdbToken = '', tmdbKey = '', fetcher = fetch } = {}) {
  const remember = async film => {
    await db.prepare('INSERT INTO films(id, json, cached_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, cached_at = excluded.cached_at')
      .run(film.id, JSON.stringify(film), Date.now());
    return film;
  };
  await db.prepare('INSERT INTO films(id, json, cached_at) VALUES ' + seedFilms.map(() => '(?, ?, ?)').join(', ') + ' ON CONFLICT(id) DO NOTHING')
    .run(...seedFilms.flatMap(film => [film.id, JSON.stringify(film), Date.now()]));
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
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    url.search = new URLSearchParams({ language: 'en-US', include_adult: 'false', ...params });
    if (tmdbKey) url.searchParams.set('api_key', tmdbKey);
    const response = await fetcher(url, { headers: tmdbToken ? { Authorization: `Bearer ${tmdbToken}` } : {}, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Movie catalog is temporarily unavailable.');
    return response.json();
  };
  return {
    async list({ query = '', genre = '', sort = 'popular', page = 1 } = {}) {
      if (tmdbToken || tmdbKey) {
        try {
          const result = await tmdb(query ? '/search/movie' : '/discover/movie', query
            ? { query, page: String(page) }
            : { page: String(page), sort_by: sort === 'newest' ? 'primary_release_date.desc' : sort === 'title' ? 'title.asc' : 'popularity.desc',
                'vote_count.gte': '100', ...(genre ? { with_genres: genre } : {}) });
          const films = await Promise.all(result.results.filter(m => m.poster_path && !m.adult && (!query || !genre || m.genre_ids?.includes(Number(genre)))).map(convert).map(async film => {
            const existing = await db.prepare('SELECT json FROM films WHERE id = ?').get(film.id);
            return remember(existing ? { ...film, ...JSON.parse(existing.json) } : film);
          }));
          return { films, page, totalPages: Math.min(result.total_pages, 500), expanded: true };
        } catch { /* The starter catalog stays useful when TMDB is unavailable. */ }
      }
      let films = seedFilms.filter(film => `${film.title} ${film.director} ${film.year}`.toLowerCase().includes(query.toLowerCase()));
      if (genre) films = films.filter(f => f.genres.includes(genreNames[Number(genre)]));
      if (sort === 'newest') films.sort((a, b) => Number(b.year) - Number(a.year));
      if (sort === 'title') films.sort((a, b) => a.title.localeCompare(b.title));
      return { films: films.slice((page - 1) * 24, page * 24), page, totalPages: Math.max(1, Math.ceil(films.length / 24)), expanded: false };
    },
    async get(id) {
      const row = await db.prepare('SELECT json, cached_at FROM films WHERE id = ?').get(id);
      const cached = row ? JSON.parse(row.json) : null;
      if ((tmdbToken || tmdbKey) && (!cached?.runtime || Date.now() - row.cached_at > 86400000)) {
        try { return remember(convert(await tmdb(`/movie/${id}`, { append_to_response: 'credits,images', include_image_language: 'en,null' }))); }
        catch { if (!cached) throw Object.assign(new Error('This film could not be loaded. Try again shortly.'), { status: 503 }); }
      }
      return cached;
    }
  };
}
