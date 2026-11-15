-- Keep the original migration immutable; existing deployments receive these indexes.
CREATE INDEX IF NOT EXISTS entries_user_page ON final_take.entries(user_id, watched_on DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS entries_film_reviews_page ON final_take.entries(film_id, watched_on DESC, created_at DESC, id DESC) WHERE review != '';
CREATE INDEX IF NOT EXISTS entries_user_film_page ON final_take.entries(user_id, film_id, watched_on DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS watchlist_user_page ON final_take.watchlist(user_id, created_at DESC, film_id DESC);
CREATE INDEX IF NOT EXISTS auth_attempts_reset ON final_take.auth_attempts(reset_at);
CREATE INDEX IF NOT EXISTS sessions_user ON final_take.sessions(user_id);

CREATE TABLE IF NOT EXISTS final_take.catalog_cache (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  cached_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS catalog_cache_age ON final_take.catalog_cache(cached_at);
ALTER TABLE final_take.catalog_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON final_take.catalog_cache FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON final_take.catalog_cache FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON final_take.catalog_cache FROM authenticated;
  END IF;
END
$$;
