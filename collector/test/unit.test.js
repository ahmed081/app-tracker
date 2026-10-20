import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, buildFeedUrl, parseAppleDate } from '../src/apple/feed.js';
import { parseGenreTree } from '../src/apple/genres.js';
import { createHttpClient, isRetryable, retryAfterMs } from '../src/apple/http.js';
import { validate, listingHash } from '../src/ingest.js';
import { slotStart } from '../src/slot.js';
import { sampleBody, feedBody, fakeEntry, range } from './helpers.js';

// ---------- feed parsing (real sample) ----------

test('parses the real PH sample response', () => {
  const r = parseFeed(sampleBody);
  assert.equal(r.ok, true);
  assert.equal(r.entries.length, 2);

  const [first, second] = r.entries;
  assert.equal(first.rank, 1);
  assert.equal(first.appleAppId, '6738949114');
  assert.equal(first.bundleId, 'com.tongitsland.game');
  assert.equal(first.name, 'Tongits Go - Super Ace');
  assert.equal(first.priceAmount, 0);
  assert.equal(first.currency, 'PHP');
  assert.equal(first.categoryId, 6014);
  assert.equal(first.releaseDate, '2025-04-07');
  assert.deepEqual(first.developer, {
    appleDeveloperId: '1783089640',
    name: 'HIFUN GAMES',
    url: 'https://apps.apple.com/ph/developer/hifun-games/id1783089640?uo=2',
  });
  assert.match(first.iconUrl, /100x100bb\.png$/, 'largest icon is kept');
  assert.equal(first.storeUrl, 'https://apps.apple.com/ph/app/tongits-go-super-ace/id6738949114?uo=2');
  assert.match(first.previewUrl, /1024x1024bb\.jpg$/);

  assert.equal(second.rank, 2);
  assert.equal(second.appleAppId, '6755110143');
});

test('feed.updated offset is converted to UTC', () => {
  const r = parseFeed(sampleBody);
  assert.equal(r.feedUpdatedAt.toISOString(), '2026-10-19T10:12:45.000Z');
  assert.equal(parseAppleDate('2026-10-19T03:00:00-07:00').toISOString(), '2026-10-19T10:00:00.000Z');
});

test('single entry as an object, missing entry, malformed body', () => {
  const one = JSON.parse(feedBody([1]));
  one.feed.entry = one.feed.entry[0];
  assert.equal(parseFeed(JSON.stringify(one)).entries.length, 1);

  const none = JSON.parse(feedBody([1]));
  delete none.feed.entry;
  const r = parseFeed(JSON.stringify(none));
  assert.equal(r.ok, true);
  assert.equal(r.entries.length, 0);

  assert.equal(parseFeed('<html>blocked</html>').ok, false);
  assert.equal(parseFeed('').ok, false);
  assert.equal(parseFeed('{"nope":1}').ok, false);
});

test('feed URL for each chart type', () => {
  const base = { countryCode: 'ph', genreId: 7006, depth: 200 };
  assert.equal(
    buildFeedUrl({ ...base, chartType: 'TOP_FREE' }, 'https://itunes.apple.com'),
    'https://itunes.apple.com/ph/rss/topfreeapplications/limit=200/genre=7006/json',
  );
  assert.match(buildFeedUrl({ ...base, chartType: 'TOP_PAID' }, 'x'), /toppaidapplications/);
  assert.match(buildFeedUrl({ ...base, chartType: 'TOP_GROSSING' }, 'x'), /topgrossingapplications/);
  assert.equal(buildFeedUrl({ ...base, depth: 500, chartType: 'TOP_FREE' }, 'x'), 'x/ph/rss/topfreeapplications/limit=200/genre=7006/json');
});

test('genre tree is flattened with parents', () => {
  const tree = JSON.stringify({
    36: { name: 'App Store', id: '36', subgenres: {
      6014: { name: 'Games', id: '6014', subgenres: {
        7006: { name: 'Casino', id: '7006' },
        7005: { name: 'Card', id: '7005' },
      } },
      6015: { name: 'Finance', id: '6015' },
    } },
  });
  const genres = parseGenreTree(tree);
  assert.deepEqual(genres.find((g) => g.id === 7006), { id: 7006, name: 'Casino', parentId: 6014 });
  assert.deepEqual(genres.find((g) => g.id === 36), { id: 36, name: 'App Store', parentId: null });
  assert.equal(genres.length, 5);
});

// ---------- validation ----------

test('validation statuses', () => {
  const v = (ids, opts) => validate(parseFeed(feedBody(ids)), { minEntries: 25, ...opts });

  assert.equal(v(range(1, 100)).status, 'VALID');

  const few = v(range(1, 12));
  assert.equal(few.status, 'INCOMPLETE');
  assert.deepEqual(few.reasons, ['below_min_entries:12']);
  assert.equal(few.writeRankings, true);

  const dup = v([...range(1, 30), 5]);
  assert.equal(dup.status, 'INCOMPLETE');
  assert.equal(dup.writeRankings, false);
  assert.ok(dup.reasons.includes('duplicate_app_id:900000005'));

  assert.equal(validate(parseFeed('garbage')).status, 'FAILED');
  assert.equal(v([]).status, 'FAILED');
  assert.equal(validate(parseFeed(feedBody(range(1, 50))), { fetchError: 'HTTP 503' }).status, 'FAILED');
});

test('listing hash changes only when the listing changes', () => {
  const a = parseFeed(JSON.stringify({ feed: { entry: [fakeEntry(1)] } })).entries[0];
  const b = parseFeed(JSON.stringify({ feed: { entry: [fakeEntry(1)] } })).entries[0];
  const c = parseFeed(JSON.stringify({ feed: { entry: [fakeEntry(1, { name: 'Renamed' })] } })).entries[0];
  assert.equal(listingHash(a), listingHash(b));
  assert.notEqual(listingHash(a), listingHash(c));
});

// ---------- slots and HTTP ----------

test('slot is the time truncated to the interval, in UTC', () => {
  assert.equal(slotStart(new Date('2026-10-19T10:37:12Z'), 60).toISOString(), '2026-10-19T10:00:00.000Z');
  assert.equal(slotStart(new Date('2026-10-19T10:37:12Z'), 15).toISOString(), '2026-10-19T10:30:00.000Z');
});

test('retry decisions', () => {
  assert.equal(isRetryable(null), true);  // network error
  assert.equal(isRetryable(429), true);
  assert.equal(isRetryable(503), true);
  assert.equal(isRetryable(404), false);
  assert.equal(isRetryable(400), false);
  assert.equal(retryAfterMs('5'), 5000);
});

const fakeResponse = (status, body = '{}', headers = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/javascript', ...headers } });

test('HTTP client retries 503 then succeeds; never retries 404', async () => {
  const sleeps = [];
  const statuses = [503, 503, 200];
  let calls = 0;
  const http = createHttpClient({
    fetchImpl: async () => fakeResponse(statuses[calls++], '{"ok":1}'),
    sleepImpl: async (ms) => { sleeps.push(ms); },
    retryDelaysMs: [10, 30, 60],
    minIntervalMs: 0,
  });
  const r = await http.getText('http://x');
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 3);
  assert.equal(r.contentType, 'text/javascript');
  assert.deepEqual(sleeps, [10, 30]);

  let calls404 = 0;
  const http404 = createHttpClient({
    fetchImpl: async () => { calls404 += 1; return fakeResponse(404); },
    sleepImpl: async () => {},
    minIntervalMs: 0,
  });
  const r404 = await http404.getText('http://x');
  assert.equal(r404.ok, false);
  assert.equal(calls404, 1);
});

test('HTTP client gives up after all retries and reports a network error', async () => {
  const http = createHttpClient({
    fetchImpl: async () => { throw new Error('ECONNRESET'); },
    sleepImpl: async () => {},
    retryDelaysMs: [1, 1, 1],
    minIntervalMs: 0,
  });
  const r = await http.getText('http://x');
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 4);
  assert.match(r.error, /network: ECONNRESET after 4 attempts/);
});
