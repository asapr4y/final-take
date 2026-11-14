-- Application data is deliberately separate from Supabase Auth and the public Data API.
-- Existing Final Take accounts keep their IDs and password hashes.
CREATE SCHEMA IF NOT EXISTS final_take;
REVOKE ALL ON SCHEMA final_take FROM PUBLIC;

CREATE TABLE IF NOT EXISTS final_take.schema_migrations (
  name TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS final_take.users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON final_take.users(lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON final_take.users(lower(email));
CREATE TABLE IF NOT EXISTS final_take.sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES final_take.users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires ON final_take.sessions(expires_at);
CREATE TABLE IF NOT EXISTS final_take.films (
  id INTEGER PRIMARY KEY,
  json TEXT NOT NULL,
  cached_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS final_take.entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES final_take.users(id) ON DELETE CASCADE,
  film_id INTEGER NOT NULL REFERENCES final_take.films(id),
  rating NUMERIC(2,1) NOT NULL CHECK (rating >= .5 AND rating <= 5 AND rating * 2 = trunc(rating * 2)),
  review TEXT NOT NULL DEFAULT '',
  watched_on TEXT NOT NULL,
  spoilers INTEGER NOT NULL DEFAULT 0 CHECK (spoilers IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_user_date ON final_take.entries(user_id, watched_on DESC);
CREATE INDEX IF NOT EXISTS entries_film ON final_take.entries(film_id, created_at DESC);
CREATE TABLE IF NOT EXISTS final_take.watchlist (
  user_id TEXT NOT NULL REFERENCES final_take.users(id) ON DELETE CASCADE,
  film_id INTEGER NOT NULL REFERENCES final_take.films(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, film_id)
);
CREATE TABLE IF NOT EXISTS final_take.favorites (
  user_id TEXT NOT NULL REFERENCES final_take.users(id) ON DELETE CASCADE,
  film_id INTEGER NOT NULL REFERENCES final_take.films(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, film_id)
);
CREATE TABLE IF NOT EXISTS final_take.auth_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at BIGINT NOT NULL
);

-- The Node server accesses these tables with a server-only database credential.
-- Browsers and Supabase anonymous/authenticated API roles have no direct access.
ALTER TABLE final_take.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_take.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_take.films ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_take.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_take.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_take.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_take.auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA final_take FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA final_take FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA final_take FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA final_take FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA final_take FROM authenticated;
  END IF;
END
$$;
