# Final Take

A personal film diary to discover movies, rate and review what you watch, and organize your watchlist.

A personal film journal in signal red, off-white, and ink black, with a Times Square-inspired night-scene hero, animated theater signage, an interactive VHS shelf, and pause/reduced-motion controls. The hero is built entirely from inline SVG, HTML, and CSS, documented in `design/times-square-scene.json`. Production accounts, sessions, ratings, reviews, watchlists, and favorites are stored in **Supabase PostgreSQL**. The browser only talks to Final Take's server; database credentials stay server-side.

## Deploy on Vercel with Supabase

1. In your Supabase project, click **Connect** at the top of the dashboard. Under **Connection string**, change **Method** from **Direct connection** to **Transaction pooler**.
2. Copy the PostgreSQL URL. Replace `[YOUR-PASSWORD]` with the database password you chose when creating the project. URL-encode special characters in that password. Use the host shown in the dashboard rather than guessing it from your region.
3. In **Vercel > Final Take > Settings > Environment Variables**, save that URL as **`DATABASE_URL`**. Apply it to the deployment environments you use. An integration-provided `POSTGRES_URL` also works. These are server-only variables; do not use a `NEXT_PUBLIC_` or `VITE_` prefix.
4. Commit and push this code, then redeploy. The included `vercel.json` serves the frontend from `public`, routes API requests to `api/index.js`, and runs `npm run vercel:build`. That build applies pending database migrations before deployment. Node.js is pinned to **24.x**.
5. If the project previously had custom build/output overrides, reset them to the repository settings. The build command is `npm run vercel:build`, output directory is `public`, and framework preset is **Other**.

Connecting Supabase to a GitHub repo does not by itself give this application a database connection string. A Supabase project URL or anonymous API key cannot be used as `DATABASE_URL`.

`APP_ORIGIN` is optional on Vercel: the app uses Vercel's forwarded host and HTTPS by default. If you set it explicitly, use the exact origin for that environment; a production-only origin should not be applied to a different preview hostname.

## Database migrations

For a local migration, copy `.env.example` to `.env`, add `DATABASE_URL`, and run:

```powershell
npm install
npm run db:migrate
```

The migration is in `supabase/migrations/202611140001_final_take.sql`. It creates the private **`final_take`** schema, tables, indexes, row-level security, and a migration history. Select that schema in Supabase's Table Editor to inspect the tables. They are intentionally outside the default `public` schema.

The migration runner uses transaction-scoped locking and checksums, and can be run repeatedly. It preserves existing rows and only inserts missing starter films. Do not edit a migration after it has been applied; add a new numbered migration instead.

The application retains its existing account system and scrypt password hashes. Accounts live in `final_take.users`, not Supabase Auth. Supabase anonymous and authenticated Data API roles have no direct access to these tables; the server-only PostgreSQL connection handles authorization. The transaction-pooler driver uses TLS, one connection per warm instance, and no prepared statements.

If you need a separate migration connection, set `MIGRATION_DATABASE_URL`; otherwise migrations use `DATABASE_URL`.

## Import an existing SQLite diary

The importer opens the source read-only. It transfers users, film records, diary entries, watchlists, and favorites in a PostgreSQL transaction. IDs and password hashes are preserved. Existing destination rows are not overwritten. Transient sessions are not imported, so users sign in again.

```powershell
# Inspect counts without changing either database:
npm run db:import -- --source ./data/final-take.sqlite

# Apply after reviewing the counts:
npm run db:import -- --source ./data/final-take.sqlite --apply
```

Keep the original SQLite file as a backup. An account conflict with a different ID stops the import rather than silently replacing an account. If the local database has no personal records, running `db:migrate` is enough.

## Run locally

Install **Node.js 24**, then:

```powershell
npm install
npm start
```

Open **http://127.0.0.1:3000**. With `DATABASE_URL` in `.env`, local development uses Supabase. Without one, local development alone can use `data/final-take.sqlite`. On Vercel, a hosted connection is required; the app will never create a temporary SQLite database that could lose user data.

Use `npm run dev` for automatic restarts. Credentials and local database files are excluded from Git.

## Included

- Film discovery with title search, genre filters, sorting, and pagination
- A curated 17-film starter catalog that works without movie API credentials
- Optional live TMDB discovery, artwork, and director information
- Individual accounts with salted scrypt password hashes and persistent server-side sessions
- Half-star ratings, reviews, watched dates, spoiler labels, and repeat viewings
- Editing and deleting your own diary entries
- Personal watchlists and four favorite films per profile
- Public profiles, biographies, diary statistics, and film reviews
- Database-backed login throttling across serverless instances
- Responsive layouts, accessible forms, native dialogs, and reduced-motion support

## Live movie discovery

Add a **TMDB API Read Access Token** as `TMDB_READ_TOKEN` in `.env` or Vercel's server-side environment variables. A legacy `TMDB_API_KEY` also works. The credential stays on the server. If TMDB is unavailable, the starter catalog remains available.

Without a credential, discovery searches only the starter catalog. Artwork requires an internet connection; unavailable images get a readable placeholder.

## Checks

```powershell
npm run check
npm test
```

Tests cover SQLite compatibility and PostgreSQL migrations, real registration/login, session cookies, diary CRUD, rewatches, account isolation, numeric rating handling, CSRF, watchlists, concurrent favorite limits, data import, and the Vercel entry point. PostgreSQL tests use PGlite, a development-only PostgreSQL engine, and never touch your cloud database.

## Self-hosting

For a regular Node host, set `HOST=0.0.0.0`, `PORT` as needed, and `APP_ORIGIN` to your exact HTTPS origin. Use `DATABASE_URL` for shared Supabase storage. The Dockerfile installs production dependencies and supports both PostgreSQL and the local SQLite development option.

## MVP scope

Email verification, password recovery, following, notifications, review moderation, and private profiles are future work. Public profiles and published diary entries are visible to visitors. Email addresses and password hashes are never returned in public responses.

## Credits

Movie metadata and images: [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB. Typography: DM Sans via Google Fonts, with a custom Final Take wordmark.
