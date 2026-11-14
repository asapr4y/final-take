const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { user: null, csrf: null, route: 0, controller: null, detail: null, authMode: 'register', afterAuth: null, lastFocus: null, listPage: 1 };
const main = $('#main');
const genres = [[28, 'Action'], [12, 'Adventure'], [16, 'Animation'], [35, 'Comedy'], [80, 'Crime'], [18, 'Drama'], [14, 'Fantasy'], [27, 'Horror'], [9648, 'Mystery'], [10749, 'Romance'], [878, 'Sci-fi'], [53, 'Thriller']];
const arrow = '<span aria-hidden="true">↗</span>';
const bookmark = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
const plus = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const checkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
const initials = name => escape(String(name).split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase());
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dateLabel = date => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
const stars = rating => `<span class="stars" aria-label="${rating} out of 5 stars">${'★'.repeat(Math.floor(rating))}${rating % 1 ? '½' : ''}<span class="stars-empty">${'☆'.repeat(Math.max(0, 5 - Math.ceil(rating)))}</span></span>`;
function placeholder(title) { return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><rect width="500" height="750" fill="#dedbd1"/><text x="250" y="350" text-anchor="middle" fill="#565d50" font-family="Georgia" font-size="30">${String(title).replace(/[<>&"']/g, '').slice(0, 24)}</text><text x="250" y="400" text-anchor="middle" fill="#a65a3d" font-family="Arial" font-size="15">FINAL TAKE</text></svg>`)}`; }

async function api(path, { method = 'GET', data, signal } = {}) {
  const response = await fetch(path, { method, credentials: 'same-origin', signal,
    headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' && state.csrf ? { 'X-CSRF-Token': state.csrf } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) { state.user = null; state.csrf = null; renderAccount(); }
    throw new Error(result.error || 'Something went wrong. Please try again.');
  }
  return result;
}
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('visible'), 3500); }
function renderAccount() {
  $('#headerAccount').innerHTML = state.user
    ? `<details class="account-menu"><summary><span class="avatar avatar-small">${initials(state.user.name)}</span><span class="account-name">${escape(state.user.name)}</span><span class="menu-chevron">⌄</span></summary><div class="account-dropdown"><a href="/u/${state.user.username}">Your profile ${arrow}</a><button data-edit-profile>Edit profile</button><button data-logout>Sign out</button></div></details>`
    : `<button class="text-button signin-button" data-auth="login">Sign in</button><button class="button button-dark button-small" data-auth="register">Start your diary ${arrow}</button>`;
}
function navigate(path, replace = false) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  $$('.account-menu[open]').forEach(menu => menu.removeAttribute('open'));
  renderRoute(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function filmCard(film, { index = null, remove = false } = {}) {
  return `<article class="film-card">
    <a class="poster-link" href="/film/${film.id}" aria-label="View ${escape(film.title)}"><img src="${escape(film.poster || placeholder(film.title))}" alt="${escape(film.title)} poster" loading="lazy" width="500" height="750" />${index !== null ? `<span class="poster-index">${String(index + 1).padStart(2, '0')}</span>` : ''}<span class="poster-open" aria-hidden="true">↗</span></a>
    <button class="poster-save" data-${remove ? 'remove-watchlist' : 'quick-watchlist'}="${film.id}" aria-label="${remove ? 'Remove' : 'Add'} ${escape(film.title)} ${remove ? 'from' : 'to'} watchlist" title="${remove ? 'Remove from' : 'Add to'} watchlist">${remove ? checkIcon : plus}</button>
    <div class="film-caption"><a href="/film/${film.id}">${escape(film.title)}</a><span>${escape(film.year)}</span></div>
    <p class="film-subtitle">${escape(film.director || film.genres.slice(0, 2).join(' / ') || 'A new discovery')}</p>
  </article>`;
}
function sectionHeading(kicker, title, link = '') {
  return `<div class="section-heading"><div><p class="eyebrow">${kicker}</p><h2>${title}</h2></div>${link}</div>`;
}
function homeView(films) {
  const fan = [films[8] || films[1], films[9] || films[2], films[0]].filter(Boolean);
  return `<section class="home-hero page-width">
    <div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> A LITTLE MORE THAN WATCHING</p><h1>Every film<br>leaves a <em>mark.</em></h1><p class="hero-description">Keep a little of every film. The ones you loved, the ones you didn’t, and the ones you’re still thinking about.</p><div class="button-row"><button class="button button-rust" ${state.user ? 'data-go-diary' : 'data-auth="register"'}>${state.user ? 'Open your diary' : 'Make your first entry'} ${arrow}</button><a class="text-link" href="/films">Find your next film <span aria-hidden="true">→</span></a></div><div class="hero-footnote"><span class="tiny-stars" aria-hidden="true">★★★★★</span><span>Your taste. Your words. Your final take.</span></div></div>
    <div class="hero-art" aria-label="Films worth keeping"><span class="art-orbit" aria-hidden="true"></span><div class="poster-fan">${fan.map((film, index) => `<a class="fan-film fan-${index}" href="/film/${film.id}" aria-label="Discover ${escape(film.title)}"><img src="${escape(film.poster || placeholder(film.title))}" alt="${escape(film.title)} poster" width="500" height="750" /></a>`).join('')}</div><span class="art-ticket"><span class="ticket-star" aria-hidden="true">✳</span> ADMIT ONE<br><small>TO YOUR NEXT OBSESSION</small></span><span class="art-caption">THE PICTURE IS JUST THE BEGINNING.</span></div>
  </section>
  <div class="marquee" aria-hidden="true"><span>WATCH CLOSELY</span><span>✳</span><span>FEEL SOMETHING</span><span>✳</span><span>WRITE IT DOWN</span><span>✳</span><span>DO IT AGAIN</span><span>✳</span><span>WATCH CLOSELY</span></div>
  <section class="page-width section-space">${sectionHeading('THE STARTER SELECTION', 'A few worth your evening.', `<a class="text-link" href="/films">Explore all films ${arrow}</a>`)}<div class="poster-grid home-grid">${films.slice(0, 6).map((film, i) => filmCard(film, { index: i })).join('')}</div></section>
  <section class="manifesto page-width"><div class="manifesto-intro"><span class="outlined-star" aria-hidden="true">✳</span><p class="eyebrow">GOOD FILMS DESERVE GOOD COMPANY</p><h2>A diary for your<br><em>life in films.</em></h2><p>Not a race to watch more.<br>A place to remember what mattered.</p></div><div class="manifesto-steps"><a href="/films"><span>01</span><div><h3>Find the next one.</h3><p>Browse new worlds, old favorites, and everything in between.</p></div>${arrow}</a><button ${state.user ? 'data-go-diary' : 'data-auth="register"'}><span>02</span><div><h3>Leave your take.</h3><p>Half a star or a whole heart. Give a film a rating, a date, and your own words.</p></div>${arrow}</button><a href="/watchlist"><span>03</span><div><h3>Keep the good ones close.</h3><p>A watchlist for what’s next. A diary for what stays.</p></div>${arrow}</a></div></section>`;
}
function discoverView(result, params) {
  const query = params.get('q') || '', genre = params.get('genre') || '', sort = params.get('sort') || 'popular';
  state.listPage = result.page;
  return `<section class="page-width discover-page"><div class="page-intro"><p class="eyebrow">THE WORLD IS BIGGER THAN YOUR WATCHLIST</p><h1>Find your <em>next.</em></h1><p>A familiar favorite or something completely out of left field.</p></div>
    <form id="searchForm" class="search-form"><label class="search-field">${searchIcon}<input type="search" name="q" value="${escape(query)}" placeholder="Search films, directors, or a year…" aria-label="Search films" maxlength="100" /><button class="search-submit" type="submit" aria-label="Search">→</button></label></form>
    <div class="discovery-tools"><div class="genre-chips" aria-label="Filter by genre"><button data-genre="" class="chip ${!genre ? 'active' : ''}">All films</button>${genres.map(([id, name]) => `<button data-genre="${id}" class="chip ${genre === String(id) ? 'active' : ''}">${name}</button>`).join('')}</div><label class="sort-label">Sort by<select id="sortSelect" aria-label="Sort films"><option value="popular" ${sort === 'popular' ? 'selected' : ''}>Our selection</option><option value="newest" ${sort === 'newest' ? 'selected' : ''}>Newest first</option><option value="title" ${sort === 'title' ? 'selected' : ''}>Title A–Z</option></select></label></div>
    <div class="results-heading"><span>${query ? `Results for “${escape(query)}”` : genre ? genres.find(x => String(x[0]) === genre)?.[1] || 'Films' : 'A world of good films'}</span><span>${result.films.length} films${result.totalPages > 1 ? ' on this page' : ''}</span></div>
    <div class="poster-grid" id="filmGrid">${result.films.map(film => filmCard(film)).join('') || emptyState('Nothing in this frame.', 'Try another title, director, or genre.', '<a class="button button-outline" href="/films">Clear filters</a>')}</div>
    ${result.page < result.totalPages ? '<div class="load-more-wrap"><button class="button button-outline" data-load-more>More discoveries ↓</button></div>' : ''}</section>`;
}
function emptyState(title, description, action = '') {
  return `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">✳</span><h2>${title}</h2><p>${description}</p>${action}</div>`;
}
function authGate(section) {
  const diary = section === 'diary';
  return `<section class="page-width gate-page"><p class="eyebrow">YOUR LIFE, FRAME BY FRAME</p><h1>${diary ? 'A story only<br><em>you can write.</em>' : 'So many films.<br><em>Something to look forward to.</em>'}</h1><p>${diary ? 'Keep your ratings, reviews, and watched dates together. Start a diary, and make every viewing a little more memorable.' : 'All those “I need to watch that” moments, collected in one good place.'}</p><button class="button button-rust" data-auth="register">${diary ? 'Start your diary' : 'Create your watchlist'} ${arrow}</button><p class="gate-signin">Already here? <button class="text-button" data-auth="login">Sign in</button></p></section>`;
}
function diaryView(entries) {
  const average = entries.length ? (entries.reduce((sum, e) => sum + e.rating, 0) / entries.length).toFixed(1) : '—';
  return `<section class="page-width collection-page"><div class="collection-heading"><div><p class="eyebrow">THE FILMS, THE FEELINGS, THE FOOTNOTES</p><h1>Your <em>diary.</em></h1><p>Every viewing has a story. Here’s yours.</p></div><a class="button button-dark" href="/films">Log a film ${plus}</a></div><div class="diary-summary"><div><strong>${entries.length}</strong><span>viewings logged</span></div><div><strong>${new Set(entries.map(e => e.film.id)).size}</strong><span>different films</span></div><div><strong>${average}</strong><span>average rating</span></div></div>
    ${entries.length ? `<div class="diary-list">${entries.map(entry => `<article class="diary-entry"><div class="entry-date"><strong>${new Date(entry.watchedOn + 'T12:00:00').getDate()}</strong><span>${new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(entry.watchedOn + 'T12:00:00'))}</span></div><a class="diary-poster" href="/film/${entry.film.id}"><img src="${escape(entry.film.poster || placeholder(entry.film.title))}" alt="${escape(entry.film.title)} poster" width="500" height="750" /></a><div class="diary-copy"><h2><a href="/film/${entry.film.id}">${escape(entry.film.title)}</a><span>${escape(entry.film.year)}</span></h2>${stars(entry.rating)}${entry.review ? `<p>${escape(entry.review.slice(0, 240))}${entry.review.length > 240 ? '…' : ''}</p>` : '<p class="quiet">A film remembered, even without the words.</p>'}${entry.spoilers ? '<span class="spoiler-tag">Contains spoilers</span>' : ''}</div><div class="entry-actions"><a class="text-link" href="/film/${entry.film.id}?edit=${entry.id}">Edit</a><button class="text-button muted" data-delete-entry="${entry.id}">Delete</button></div></article>`).join('')}</div>` : emptyState('The opening page is yours.', 'Find a film you’ve seen and leave your first take.', '<a class="button button-rust" href="/films">Find a film ↗</a>')}</section>`;
}
function watchlistView(films) {
  return `<section class="page-width collection-page"><div class="collection-heading"><div><p class="eyebrow">FOR A RAINY NIGHT, A SUNDAY, OR RIGHT NOW</p><h1>The <em>watchlist.</em></h1><p>${films.length ? `${films.length} ${films.length === 1 ? 'film' : 'films'} waiting for the right moment.` : 'Your next great watch starts here.'}</p></div><a class="button button-outline" href="/films">Find something good ${arrow}</a></div><div class="poster-grid">${films.length ? films.map(film => filmCard(film, { remove: true })).join('') : emptyState('Make room for a little anticipation.', 'Tap the + on a film to save it for later.', '<a class="button button-rust" href="/films">Explore films ↗</a>')}</div></section>`;
}
function reviewCard(entry, own = false) {
  return `<article class="review-card"><div class="review-author"><a class="avatar avatar-small" href="/u/${entry.username}">${initials(entry.name)}</a><div><a href="/u/${entry.username}">${escape(entry.name)}</a><span>Watched ${dateLabel(entry.watchedOn)}</span></div>${stars(entry.rating)}</div>${entry.spoilers && !own ? `<details class="spoiler-review"><summary>Contains spoilers — reveal review</summary><p>${escape(entry.review)}</p></details>` : `<p>${escape(entry.review)}</p>`}${own ? `<a class="text-link small-link" href="/film/${entry.film.id}?edit=${entry.id}">Edit your entry ${arrow}</a>` : ''}</article>`;
}
function entryForm(film, editing = null) {
  const value = editing?.rating || 0;
  return `<form class="log-form" id="entryForm" data-film="${film.id}" ${editing ? `data-entry="${editing.id}"` : ''}>
    <div class="log-heading"><p class="eyebrow">${editing ? 'REFINE YOUR TAKE' : 'MAKE IT PART OF YOUR STORY'}</p><h2>${editing ? 'Edit this viewing.' : 'Your final take.'}</h2></div>
    <label class="field-label" for="ratingSelect">Your rating</label><div class="rating-control"><div class="rating-stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-rate="${n}" class="rating-star ${n <= value ? 'chosen' : n - .5 === value ? 'half-chosen' : ''}" aria-label="Rate ${n} ${n === 1 ? 'star' : 'stars'}">★</button>`).join('')}</div><select id="ratingSelect" name="rating" required aria-label="Your rating out of five stars"><option value="">Choose</option>${Array.from({ length: 10 }, (_, i) => (i + 1) / 2).map(n => `<option value="${n}" ${n === value ? 'selected' : ''}>${n} / 5</option>`).join('')}</select></div>
    <label>Watched on<input type="date" name="watchedOn" value="${editing?.watchedOn || today()}" max="${today()}" min="1888-01-01" required /></label>
    <label>Your review <span class="optional">(optional)</span><textarea name="review" maxlength="5000" rows="5" placeholder="What stayed with you?">${escape(editing?.review || '')}</textarea></label>
    <label class="checkbox-label"><input type="checkbox" name="spoilers" ${editing?.spoilers ? 'checked' : ''} /> This review contains spoilers</label>
    <p class="form-error" role="alert"></p><button class="button button-dark" type="submit">${editing ? 'Save changes' : 'Log this film'} ${arrow}</button>
    ${editing ? `<a class="text-link small-link" href="/film/${film.id}">Cancel editing</a>` : '<p class="log-note">Another watch? Another entry. Every viewing counts.</p>'}
  </form>`;
}
function filmView(detail, params) {
  const { film, my, aggregate, reviews } = detail;
  const editing = my?.entries.find(e => e.id === params.get('edit')) || null;
  const runtime = film.runtime ? `${Math.floor(film.runtime / 60)}h ${film.runtime % 60}m` : '';
  return `<section class="film-masthead ${film.backdrop ? '' : 'no-backdrop'}">${film.backdrop ? `<img class="film-backdrop" src="${escape(film.backdrop)}" alt="" />` : ''}<div class="page-width film-masthead-inner"><a class="back-link" href="/films">← Back to discoveries</a><p class="eyebrow">${escape(film.genres.slice(0, 3).join(' / '))}</p><h1>${escape(film.title)}</h1><p class="film-byline">${escape(film.year)}${runtime ? ` <span>·</span> ${runtime}` : ''}${film.director ? ` <span>·</span> Directed by <strong>${escape(film.director)}</strong>` : ''}</p></div></section>
    <div class="page-width film-layout"><aside class="film-poster-column"><img class="detail-poster" src="${escape(film.poster || placeholder(film.title))}" alt="${escape(film.title)} poster" width="500" height="750" /><div class="film-collection-actions"><button class="button button-outline ${my?.watchlisted ? 'is-saved' : ''}" data-toggle-watchlist="${film.id}" data-saved="${Boolean(my?.watchlisted)}">${my?.watchlisted ? checkIcon : bookmark}${my?.watchlisted ? 'In your watchlist' : 'Add to watchlist'}</button><button class="text-button favorite-action" data-toggle-favorite="${film.id}" data-saved="${Boolean(my?.favorite)}">${my?.favorite ? '♥ In your four favorites' : '♡ Make it a favorite'}</button></div></aside>
    <div class="film-story"><p class="eyebrow">THE STORY</p>${film.tagline ? `<h2 class="tagline">${escape(film.tagline)}</h2>` : ''}<p class="film-overview">${escape(film.overview)}</p><div class="film-facts"><div><span>RELEASED</span><strong>${escape(film.year || 'Not announced')}</strong></div><div><span>GENRES</span><strong>${escape(film.genres.join(', ') || 'Unlisted')}</strong></div>${film.director ? `<div><span>DIRECTOR</span><strong>${escape(film.director)}</strong></div>` : ''}</div>
    <section class="reviews-section"><div class="section-heading"><div><p class="eyebrow">EVERY FILM STARTS A CONVERSATION</p><h2>The takes.</h2></div><span class="review-count">${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}</span></div>${aggregate.count ? `<div class="community-rating">${stars(aggregate.average)}<strong>${aggregate.average}/5</strong><span>from ${aggregate.count} ${aggregate.count === 1 ? 'viewing' : 'viewings'}</span></div>` : ''}${reviews.length ? reviews.map(entry => reviewCard(entry, entry.userId === state.user?.id)).join('') : '<div class="review-empty"><span aria-hidden="true">“</span><p>No reviews yet.<br>There’s room here for your perspective.</p></div>'}</section></div>
    <aside class="film-log-column">${state.user ? `${my?.entries.length && !editing ? `<div class="last-viewing">${checkIcon}<div>Already part of your diary<small>Last watched ${dateLabel(my.entries[0].watchedOn)} · ${my.entries[0].rating}/5</small></div></div>` : ''}${entryForm(film, editing)}` : `<div class="join-card"><span class="join-symbol" aria-hidden="true">✳</span><p class="eyebrow">YOU HAVE A TAKE.</p><h2>Give it a<br>place to live.</h2><p>Rate this film, write a review, and keep it in your own film diary.</p><button class="button button-rust" data-auth="register">Start your diary ${arrow}</button><button class="text-button" data-auth="login">Already a member? Sign in</button></div>`}</aside></div>`;
}
function profileView(profile) {
  const own = profile.user.id === state.user?.id;
  return `<section class="page-width profile-page"><div class="profile-heading"><span class="avatar avatar-large">${initials(profile.user.name)}</span><div><p class="eyebrow">A LIFE IN FILMS</p><h1>${escape(profile.user.name)}<span class="profile-period">.</span></h1><p class="profile-username">@${profile.user.username} · Here since ${new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(profile.user.joined))}</p>${profile.user.bio ? `<p class="profile-bio">${escape(profile.user.bio)}</p>` : own ? '<p class="profile-bio quiet">A few words about your taste would look good here.</p>' : ''}</div>${own ? '<button class="button button-outline" data-edit-profile>Edit profile ↗</button>' : ''}</div>
    <div class="profile-stats"><div><strong>${profile.stats.films}</strong><span>films watched</span></div><div><strong>${profile.stats.entries}</strong><span>diary entries</span></div><div><strong>${profile.stats.reviews}</strong><span>reviews written</span></div><div><strong>${profile.stats.average || '—'}</strong><span>average rating</span></div></div>
    <section class="favorites-section">${sectionHeading('FOUR FILMS. A THOUSAND WORDS.', own ? 'Your kind of cinema.' : `${escape(profile.user.name.split(' ')[0])}’s kind of cinema.`)}<div class="favorites-grid">${Array.from({ length: 4 }, (_, i) => profile.favorites[i] ? filmCard(profile.favorites[i]) : `<a class="favorite-empty" href="/films" aria-label="Discover a favorite film"><span aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><p>${own ? 'Find a favorite' : 'An open frame'} ${arrow}</p></a>`).join('')}</div>${own ? '<p class="section-note">Add a film to your four favorites from its film page.</p>' : ''}</section>
    <section class="profile-recent">${sectionHeading('THE LATEST CHAPTER', 'Recently watched.', own ? '<a class="text-link" href="/diary">Open full diary ↗</a>' : '')}${profile.entries.length ? `<div class="recent-grid">${profile.entries.slice(0, 6).map(entry => `<article><a href="/film/${entry.film.id}"><img src="${escape(entry.film.poster || placeholder(entry.film.title))}" alt="${escape(entry.film.title)} poster" width="500" height="750" /></a><a class="recent-title" href="/film/${entry.film.id}">${escape(entry.film.title)}</a>${stars(entry.rating)}<span class="recent-date">${dateLabel(entry.watchedOn)}</span></article>`).join('')}</div>` : emptyState(own ? 'Your first chapter is waiting.' : 'The opening credits are still rolling.', own ? 'Log a film to start filling these pages.' : 'No films logged yet.', own ? '<a class="button button-outline" href="/films">Find a film ↗</a>' : '')}</section></section>`;
}

async function renderRoute() {
  const route = ++state.route; state.controller?.abort(); state.controller = new AbortController();
  const { signal } = state.controller, path = location.pathname, params = new URLSearchParams(location.search);
  state.detail = null;
  $$('.main-nav a').forEach(a => { if (a.dataset.nav === (path.startsWith('/film') ? 'films' : path.slice(1))) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  main.innerHTML = `<div class="page-width loading-page" role="status" aria-label="Loading"><div class="skeleton skeleton-title"></div><div class="poster-grid">${Array.from({ length: 6 }, () => '<div class="skeleton skeleton-poster"></div>').join('')}</div>`;
  try {
    let html, title = 'A life in films.';
    if (path === '/') { const result = await api('/api/films', { signal }); html = homeView(result.films); }
    else if (path === '/films') { const result = await api(`/api/films?${params}`, { signal }); html = discoverView(result, params); title = 'Discover'; }
    else if (path === '/diary') { html = state.user ? diaryView((await api('/api/me/diary', { signal })).entries) : authGate('diary'); title = 'Your diary'; }
    else if (path === '/watchlist') { html = state.user ? watchlistView((await api('/api/me/watchlist', { signal })).films) : authGate('watchlist'); title = 'Your watchlist'; }
    else if (/^\/film\/\d+$/.test(path)) { const detail = await api(`/api/films/${path.split('/')[2]}`, { signal }); if (route !== state.route) return; state.detail = detail; html = filmView(detail, params); title = detail.film.title; }
    else if (/^\/u\/[a-zA-Z0-9_]+$/.test(path)) { const profile = await api(`/api/members/${path.split('/')[2]}`, { signal }); html = profileView(profile); title = profile.user.name; }
    else html = `<section class="page-width">${emptyState('A missing reel.', 'This page isn’t part of the story. Let’s find you a good film instead.', '<a class="button button-rust" href="/films">Back to discoveries ↗</a>')}</section>`;
    if (route !== state.route) return;
    main.innerHTML = html; document.title = `${title} — Final Take`;
    if (params.has('edit')) $('#entryForm')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (error) {
    if (error.name === 'AbortError' || route !== state.route) return;
    main.innerHTML = `<section class="page-width">${emptyState('A brief intermission.', escape(error.message), '<button class="button button-outline" data-retry>Try again ↗</button>')}</section>`;
  }
}
function renderAuth(mode) {
  state.authMode = mode;
  const register = mode === 'register';
  $('#authContent').innerHTML = `<span class="modal-mark" aria-hidden="true">f.</span><p class="eyebrow">${register ? 'THE FIRST PAGE IS YOURS' : 'BACK FOR ANOTHER CHAPTER'}</p><h2 id="authTitle">${register ? 'A life in films.<br>Starting with yours.' : 'Good to see<br>you again.'}</h2><p class="modal-intro">${register ? 'Make room for the films that stay with you.' : 'Your diary is right where you left it.'}</p><form id="authForm" class="stack-form">${register ? '<div class="form-two"><label>Your name<input name="name" autocomplete="name" maxlength="50" required placeholder="Alex Rivera" /></label><label>Username<input name="username" autocomplete="username" pattern="[A-Za-z0-9_]{3,24}" minlength="3" maxlength="24" required placeholder="alexinframes" /></label></div>' : ''}<label>${register ? 'Email address' : 'Email or username'}<input name="email" type="${register ? 'email' : 'text'}" autocomplete="${register ? 'email' : 'username'}" required maxlength="254" placeholder="${register ? 'you@example.com' : 'Your email or username'}" /></label><label>Password<input type="password" name="password" autocomplete="${register ? 'new-password' : 'current-password'}" ${register ? 'minlength="10"' : ''} maxlength="128" required placeholder="${register ? 'At least 10 characters' : 'Your password'}" /></label><p class="form-error" role="alert"></p><button class="button button-rust" type="submit">${register ? 'Create your diary' : 'Sign in'} ${arrow}</button></form><p class="auth-switch">${register ? 'Already have a diary?' : 'New around here?'} <button class="text-button" data-auth-switch="${register ? 'login' : 'register'}">${register ? 'Sign in' : 'Start yours'}</button></p>`;
}
function openAuth(mode = 'register', after = null) { state.afterAuth = after; state.lastFocus = document.activeElement; renderAuth(mode); $('#authDialog').showModal(); }
function requireAccount(action) { if (state.user) return action(); openAuth('register', action); }
async function toggleCollection(type, id, saved) {
  await api(`/api/${type}/${id}`, { method: saved ? 'DELETE' : 'PUT' });
  toast(type === 'favorites' ? saved ? 'A frame opened in your favorites.' : 'Added to your four favorites.' : saved ? 'Removed from your watchlist.' : 'Saved for a good evening.');
  if (location.pathname === `/film/${id}` || location.pathname === '/watchlist') await renderRoute();
}
async function confirmDelete() { const dialog = $('#confirmDialog'); dialog.returnValue = ''; dialog.showModal(); return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'delete'), { once: true })); }
function updateRating(value) { const select = $('#ratingSelect'); if (!select) return; select.value = String(value); $$('.rating-star').forEach(button => { const star = Number(button.dataset.rate); button.classList.toggle('chosen', star <= value); button.classList.toggle('half-chosen', star > value && star - .5 === value); }); }
async function openProfileEditor() { if (!state.user) return; const form = $('#profileForm'); form.elements.name.value = state.user.name; form.elements.bio.value = state.user.bio || ''; $('.form-error', form).textContent = ''; $('#profileDialog').showModal(); }

document.addEventListener('click', async event => {
  const link = event.target.closest('a[href^="/"]');
  if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !link.target && event.button === 0) { event.preventDefault(); navigate(link.getAttribute('href')); return; }
  const auth = event.target.closest('[data-auth]'); if (auth) return openAuth(auth.dataset.auth);
  const authSwitch = event.target.closest('[data-auth-switch]'); if (authSwitch) { renderAuth(authSwitch.dataset.authSwitch); $('input', $('#authContent'))?.focus(); return; }
  const close = event.target.closest('[data-close-dialog]'); if (close) return $(`#${close.dataset.closeDialog}`).close();
  const rate = event.target.closest('[data-rate]'); if (rate) { const rect = rate.getBoundingClientRect(); const half = event.detail !== 0 && event.clientX - rect.left < rect.width / 2; return updateRating(Number(rate.dataset.rate) - (half ? .5 : 0)); }
  const genre = event.target.closest('[data-genre]'); if (genre) { const params = new URLSearchParams(location.search); params.delete('page'); if (genre.dataset.genre) params.set('genre', genre.dataset.genre); else params.delete('genre'); return navigate(`/films?${params}`); }
  const target = event.target.closest('button'); if (!target) return;
  try {
    if (target.hasAttribute('data-retry')) return renderRoute();
    if (target.hasAttribute('data-go-diary')) return navigate('/diary');
    if (target.hasAttribute('data-edit-profile')) return openProfileEditor();
    if (target.hasAttribute('data-logout')) { await api('/api/auth/logout', { method: 'POST' }); state.user = null; state.csrf = null; renderAccount(); toast('Until the next film.'); return navigate('/'); }
    if (target.dataset.quickWatchlist) return requireAccount(async () => { try { target.disabled = true; await toggleCollection('watchlist', target.dataset.quickWatchlist, false); target.innerHTML = checkIcon; target.setAttribute('aria-label', 'Saved to watchlist'); } catch (error) { toast(error.message); } finally { target.disabled = false; } });
    if (target.dataset.removeWatchlist) { target.disabled = true; return await toggleCollection('watchlist', target.dataset.removeWatchlist, true); }
    if (target.dataset.toggleWatchlist || target.dataset.toggleFavorite) { const type = target.dataset.toggleWatchlist ? 'watchlist' : 'favorites', id = target.dataset.toggleWatchlist || target.dataset.toggleFavorite; return requireAccount(async () => { try { target.disabled = true; await toggleCollection(type, id, target.dataset.saved === 'true'); } catch (error) { toast(error.message); } finally { target.disabled = false; } }); }
    if (target.dataset.deleteEntry) { if (!await confirmDelete()) return; target.disabled = true; await api(`/api/entries/${target.dataset.deleteEntry}`, { method: 'DELETE' }); toast('Entry removed from your diary.'); return renderRoute(); }
    if (target.hasAttribute('data-load-more')) { target.disabled = true; target.textContent = 'Finding a few more…'; const params = new URLSearchParams(location.search); params.set('page', state.listPage + 1); const result = await api(`/api/films?${params}`); state.listPage = result.page; $('#filmGrid')?.insertAdjacentHTML('beforeend', result.films.map(f => filmCard(f)).join('')); if (result.page >= result.totalPages) target.remove(); else { target.disabled = false; target.textContent = 'More discoveries ↓'; } }
  } catch (error) { toast(error.message); target.disabled = false; }
});
document.addEventListener('change', event => {
  if (event.target.id === 'ratingSelect') updateRating(Number(event.target.value));
  if (event.target.id === 'sortSelect') { const params = new URLSearchParams(location.search); params.set('sort', event.target.value); params.delete('page'); navigate(`/films?${params}`); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id === 'searchForm') { event.preventDefault(); const params = new URLSearchParams(location.search); params.delete('page'); const query = new FormData(form).get('q').trim(); if (query) params.set('q', query); else params.delete('q'); return navigate(`/films?${params}`); }
  if (!['authForm', 'entryForm', 'profileForm'].includes(form.id)) return;
  event.preventDefault(); const button = $('button[type="submit"]', form), errorNode = $('.form-error', form), data = Object.fromEntries(new FormData(form));
  button.disabled = true; errorNode.textContent = '';
  try {
    if (form.id === 'authForm') { const result = await api(`/api/auth/${state.authMode === 'register' ? 'register' : 'login'}`, { method: 'POST', data }); state.user = result.user; state.csrf = result.csrf; $('#authDialog').close(); renderAccount(); toast(state.authMode === 'register' ? 'Your next chapter starts here.' : 'Welcome back.'); const after = state.afterAuth; state.afterAuth = null; await renderRoute(); if (after) await after(); }
    if (form.id === 'entryForm') { data.filmId = Number(form.dataset.film); data.rating = Number(data.rating); data.spoilers = data.spoilers === 'on'; await api(form.dataset.entry ? `/api/entries/${form.dataset.entry}` : '/api/entries', { method: form.dataset.entry ? 'PATCH' : 'POST', data }); toast(form.dataset.entry ? 'Your take, refined.' : 'Another film, kept with you.'); navigate(`/film/${form.dataset.film}`, true); }
    if (form.id === 'profileForm') { const result = await api('/api/me/profile', { method: 'PATCH', data }); state.user = result.user; renderAccount(); $('#profileDialog').close(); toast('Feels more like you.'); if (location.pathname.startsWith('/u/')) await renderRoute(); }
  } catch (error) { errorNode.textContent = error.message; }
  finally { button.disabled = false; }
});
document.addEventListener('error', event => { if (event.target.tagName === 'IMG' && !event.target.dataset.fallback) { event.target.dataset.fallback = 'true'; event.target.src = placeholder(event.target.alt.replace(/ poster$/, '') || 'A film to discover'); } }, true);
for (const dialog of $$('dialog')) {
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { if (dialog.id === 'authDialog') state.lastFocus?.isConnected && state.lastFocus.focus(); });
}
window.addEventListener('popstate', renderRoute);
document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.account-menu[open]').forEach(menu => menu.removeAttribute('open')); });
async function boot() { try { const result = await api('/api/session'); state.user = result.user; state.csrf = result.csrf; } catch { toast('You’re offline. Reconnect and try again.'); } renderAccount(); await renderRoute(); }
boot();
