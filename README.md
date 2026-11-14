# Final Take

A personal film diary to discover movies, rate and review what you watch, and organize your watchlist.

An editorial film journal in warm paper, charcoal, olive, and rust. This is a standalone application with its own accounts and database.

## Run locally

Install **Node.js 24 or newer**, then run:

```powershell
npm start
```

Open **http://127.0.0.1:3000**. There are no third-party runtime dependencies to install. Use `npm run dev` for automatic server restarts while editing.

Create an account in the app to start your diary. Accounts, sessions, reviews, watchlists, and favorites are stored in `data/final-take.sqlite`, created automatically on the first run. The directory is excluded from Git. No demo users or fabricated reviews are added.

## Included

- Film discovery with title search, genre filters, sorting, and pagination
- A curated 17-film starter catalog that works without API credentials
- Optional live TMDB discovery, detail pages, artwork, and director information
- Individual accounts with salted scrypt password hashes and server-side sessions
- Half-star ratings, reviews, watched dates, spoiler labels, and repeat viewings
- Editing and deleting your own diary entries
- Personal watchlists and four favorite films per profile
- Public profiles, biographies, diary statistics, and film reviews
- Responsive layouts, keyboard-accessible forms, native dialogs, and reduced-motion support

## Live movie discovery

Copy `.env.example` to `.env` and add a **TMDB API Read Access Token** as `TMDB_READ_TOKEN`. A legacy `TMDB_API_KEY` also works. Restart the server. The credential stays on the server. When TMDB is unavailable, the starter catalog remains available.

Without a TMDB credential, search is limited to the starter catalog. Movie images require an internet connection; unavailable artwork gets a readable placeholder.

## Checks

```powershell
npm run check
npm test
```

The integration tests cover real registration and login, cookie sessions, diary CRUD, rewatches, account isolation, CSRF protection, watchlists, favorite limits, input validation, and persistence across server restarts.

## Deployment

Run this app on a **Node.js server with persistent storage**. Set `HOST=0.0.0.0`, `PORT` as required by the host, and `APP_ORIGIN` to the exact public HTTPS origin. `APP_ORIGIN` enables secure session cookies and origin checks. Set `SQLITE_PATH` to a file on the persistent disk.

The included Dockerfile supports a named data volume:

```sh
docker build -t final-take .
docker run --name final-take -p 3000:3000 -v final-take-data:/data -e APP_ORIGIN=https://your-domain.example final-take
```

Put the container behind your HTTPS reverse proxy. For local Docker use, omit `APP_ORIGIN` and visit `http://localhost:3000`.

This SQLite setup targets a single server. Vercel's ephemeral serverless filesystem is not suitable for its database. If deploying there later, move persistence to a hosted database first.

To back up local development data, stop the app and copy the `data` directory. Keep it out of public repositories and retain it across deployments.

## MVP scope

The current version includes accounts and the personal diary. Email verification, password recovery, following, notifications, review moderation, and private profiles are future work. Public profiles and published diary entries are visible to visitors. Email addresses and password hashes are never returned in public responses.

## Credits

Movie metadata and images are provided by [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB. Typography: DM Sans and DM Serif Display via Google Fonts.
