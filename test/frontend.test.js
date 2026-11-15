import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

// Exercise the actual route/view code with a minimal DOM adapter. This checks
// rendering contracts; a real browser is still required for visual layout QA.
async function frontend() {
  const main = { innerHTML: '' };
  const context = createContext({
    console, URLSearchParams, AbortController, AbortSignal, setTimeout, clearTimeout,
    mountCityScene() {},
    location: { pathname: '/diary', search: '' },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
    document: {
      querySelector: selector => selector === '#main' ? main : null,
      querySelectorAll: () => [], addEventListener() {}, body: { classList: { toggle() {} } }
    },
    fetch: async path => { context.request = path; return { ok: true, json: async () => context.result }; }
  });
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
    .replace(/^import[^\n]+\n/, '').replace('\nboot();', '');
  runInContext(source, context);
  runInContext("state.user = { id: 'alice', name: 'Alice' };", context);
  return { context, main, render: () => runInContext('renderRoute()', context) };
}
const film = { id: 693134, title: 'Dune: Part Two', year: '2024', poster: '', genres: ['Drama'], director: 'A Director', overview: 'A story.' };
const entry = { id: 'old-entry', userId: 'alice', film, rating: 4.5, review: '<script>test</script>', watchedOn: '2026-01-20', createdAt: '2026-01-20', username: 'alice', name: 'Alice' };

test('diary route renders full statistics and cursor navigation while escaping reviews', async () => {
  const { context, main, render } = await frontend();
  context.location.search = '?cursor=previous';
  context.result = { entries: [entry], stats: { entries: 245, films: 30, average: 4.2 }, nextCursor: 'next-page' };
  await render();
  assert.equal(context.request, '/api/me/diary?cursor=previous');
  assert.match(main.innerHTML, /245<\/strong><span>viewings logged/);
  assert.match(main.innerHTML, /30<\/strong><span>different films/);
  assert.match(main.innerHTML, /4\.2<\/strong><span>average rating/);
  assert.match(main.innerHTML, /href="\/diary\?cursor=next-page"/);
  assert.match(main.innerHTML, /Back to first page/);
  assert.ok(!main.innerHTML.includes('<script>test</script>'));
  assert.match(main.innerHTML, /&lt;script&gt;test&lt;\/script&gt;/);
});

test('watchlist route renders the full count and links to additional saved films', async () => {
  const { context, main, render } = await frontend();
  context.location.pathname = '/watchlist';
  context.result = { films: [film], total: 35, nextCursor: 'more-films' };
  await render();
  assert.match(main.innerHTML, /35 films waiting/);
  assert.match(main.innerHTML, /href="\/watchlist\?cursor=more-films"/);
  assert.match(main.innerHTML, /data-remove-watchlist="693134"/);
});

test('film route forwards edit parameters, renders old entries, and paginates reviews', async () => {
  const { context, main, render } = await frontend();
  context.location.pathname = '/film/693134';
  context.location.search = '?edit=old-entry';
  context.result = { film, reviews: [entry], aggregate: { average: 4.5, count: 246, reviews: 245 },
    my: { entries: [entry], watchlisted: false, favorite: false }, nextCursor: 'more-reviews' };
  await render();
  assert.equal(context.request, '/api/films/693134?edit=old-entry');
  assert.match(main.innerHTML, /245 reviews/);
  assert.match(main.innerHTML, /data-entry="old-entry"/);
  assert.match(main.innerHTML, /href="\/film\/693134\?cursor=more-reviews"/);
});
