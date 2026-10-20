// Integration test against a real PostgreSQL. Runs only when TEST_DATABASE_URL
// is set; the database is wiped. A local HTTP server plays the role of Apple.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feedBody, range } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'set TEST_DATABASE_URL to run database tests';

// Mutable "Apple": path → { status, body }
const routes = new Map();
let server;
let m; // loaded modules

before(async () => {
  if (skip) return;
  server = createServer((req, res) => {
    const r = routes.get(req.url) ?? { status: 404, body: 'not found' };
    res.writeHead(r.status, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(r.body);
  });
  await new Promise((resolve) => server.listen(0, resolve));

  Object.assign(process.env, {
    DATABASE_URL: url,
    APPLE_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    HTTP_RETRY_DELAYS_MS: '',
    HTTP_MIN_INTERVAL_MS: '0',
    JITTER_MAX_SECONDS: '0',
    RETRY_AFTER_MINUTES: '0',
    MIN_ENTRIES: '25',
  });
  const { readFile } = await import('node:fs/promises');
  m = {
    db: await import('../src/db.js'),
    collect: await import('../src/collect.js'),
    charts: await import('../src/charts.js'),
    genres: await import('../src/genres.js'),
    http: await import('../src/apple/http.js'),
  };
  const sql = (f) => readFile(new URL(`../db/${f}`, import.meta.url), 'utf8');
  await m.db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await m.db.pool.query(await sql('schema.sql'));
  await m.db.pool.query(await sql('seed.sql'));
});

after(async () => {
  if (skip) return;
  await m.db.closePool();
  server.close();
});

const q = async (text, params) => (await m.db.pool.query(text, params)).rows;
const feedPath = (genre) => `/ph/rss/topfreeapplications/limit=200/genre=${genre}/json`;
const silent = () => {};

test('configuration turns into charts, with every switch respected', { skip }, async () => {
  await m.charts.syncCharts();
  let charts = await q(`SELECT chart_key, active FROM v_chart ORDER BY chart_key`);
  assert.deepEqual(charts, [
    { chart_key: 'ph/7004/top-free', active: true },
    { chart_key: 'ph/7005/top-free', active: true },
    { chart_key: 'ph/7006/top-free', active: true },
  ]);

  // Disable a genre → its chart deactivates; re-enable → same chart, active again.
  await q(`UPDATE genre SET enabled = false WHERE id = 7004`);
  await m.charts.syncCharts();
  charts = await q(`SELECT chart_key, active FROM v_chart WHERE genre_id = 7004`);
  assert.deepEqual(charts, [{ chart_key: 'ph/7004/top-free', active: false }]);
  await q(`UPDATE genre SET enabled = true WHERE id = 7004`);
  await m.charts.syncCharts();
  assert.equal((await q(`SELECT count(*)::int AS n FROM chart`))[0].n, 3);

  // all_countries: enabling a country starts tracking there.
  await q(`UPDATE tracking SET all_countries = true WHERE genre_id = 7005`);
  await q(`UPDATE country SET enabled = true WHERE code = 'us'`);
  await m.charts.syncCharts();
  assert.deepEqual(await q(`SELECT chart_key FROM v_chart WHERE active AND genre_id = 7005 ORDER BY 1`),
    [{ chart_key: 'ph/7005/top-free' }, { chart_key: 'us/7005/top-free' }]);

  // Disabling the country stops it everywhere; nothing is deleted.
  await q(`UPDATE country SET enabled = false WHERE code = 'us'`);
  await m.charts.syncCharts();
  assert.deepEqual(await q(`SELECT chart_key, active FROM v_chart WHERE country_code = 'us'`),
    [{ chart_key: 'us/7005/top-free', active: false }]);
  await q(`UPDATE tracking SET all_countries = false WHERE genre_id = 7005`);
});

test('genre sync adds new genres disabled and keeps your switches', { skip }, async () => {
  const tree = JSON.stringify({ 36: { id: '36', name: 'App Store', subgenres: {
    6014: { id: '6014', name: 'Games', subgenres: {
      7004: { id: '7004', name: 'Board' }, 7005: { id: '7005', name: 'Card' },
      7006: { id: '7006', name: 'Casino' }, 7019: { id: '7019', name: 'Word' },
    } } } } });
  const r = await m.genres.syncGenresFromBody(tree);
  assert.equal(r.added, 1);
  const rows = await q(`SELECT id, enabled, available_on_apple FROM genre WHERE id IN (7006, 7019) ORDER BY id`);
  assert.deepEqual(rows, [
    { id: 7006, enabled: true, available_on_apple: true },
    { id: 7019, enabled: false, available_on_apple: true },
  ]);
});

test('hourly collection builds history and rank changes', { skip }, async () => {
  const http = m.http.createHttpClient({ minIntervalMs: 0, retryDelaysMs: [] });
  routes.set(feedPath(7004), { status: 200, body: feedBody(range(201, 230)) });
  routes.set(feedPath(7005), { status: 200, body: feedBody(range(301, 330)) });

  // Yesterday 10:00: apps 1..100, app 5 at #5.
  const day1 = new Date('2026-10-18T10:05:00Z');
  routes.set(feedPath(7006), { status: 200, body: feedBody(range(1, 100)) });
  await m.collect.collectDue({ http, now: day1, jitter: false, log: silent });

  // Collecting again in the same slot stores nothing new.
  await m.collect.collectDue({ http, now: new Date('2026-10-18T10:20:00Z'), jitter: false, log: silent });
  assert.equal((await q(`SELECT count(*)::int AS n FROM raw_reading`))[0].n, 3);

  // Today 10:00: app 5 climbs to #2, app 101 is new at #1, app 100 left, app 7 renamed.
  const today = [101, 1, 5, ...range(2, 4), ...range(6, 99)];
  routes.set(feedPath(7006), {
    status: 200,
    body: feedBody(today, { updated: '2026-10-19T03:05:00-07:00', names: { 7: 'Renamed App' } }),
  });
  await m.collect.collectDue({ http, now: new Date('2026-10-19T10:05:00Z'), jitter: false, log: silent });

  const snaps = await q(`SELECT slot_start, status, entry_count, is_baseline, feed_updated_at
                         FROM snapshot s JOIN v_chart c ON c.id = s.chart_id
                         WHERE c.chart_key = 'ph/7006/top-free' ORDER BY slot_start`);
  assert.equal(snaps.length, 2);
  assert.deepEqual(snaps.map((s) => [s.status, s.entry_count, s.is_baseline]),
    [['VALID', 100, true], ['VALID', 100, false]]);
  assert.equal(snaps[1].feed_updated_at.toISOString(), '2026-10-19T10:05:00.000Z');

  const change = await q(`SELECT apple_app_id, current_rank, previous_rank, change
                          FROM v_rank_change_24h WHERE chart_key = 'ph/7006/top-free'
                          AND apple_app_id IN ('900000005', '900000101') ORDER BY current_rank`);
  assert.deepEqual(change, [
    { apple_app_id: '900000101', current_rank: 1, previous_rank: null, change: null },
    { apple_app_id: '900000005', current_rank: 3, previous_rank: 5, change: 2 },
  ]);

  // App tracked since its first appearance; listing history captured the rename.
  const [app7] = await q(`SELECT a.first_seen_at, a.last_seen_at,
                                 (SELECT array_agg(name ORDER BY first_seen_at) FROM app_listing_version v WHERE v.app_id = a.id) AS names
                          FROM app a WHERE apple_app_id = '900000007'`);
  assert.equal(app7.first_seen_at.toISOString(), '2026-10-18T10:00:00.000Z');
  assert.equal(app7.last_seen_at.toISOString(), '2026-10-19T10:00:00.000Z');
  assert.deepEqual(app7.names, ['Test App 7', 'Renamed App']);

  // Unchanged apps keep one listing version.
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM app_listing_version v JOIN app a ON a.id = v.app_id
                           WHERE a.apple_app_id = '900000005'`);
  assert.equal(n, 1);

  const history = await q(`SELECT slot_start, rank FROM v_ranking_history
                           WHERE apple_app_id = '900000005' AND chart_key = 'ph/7006/top-free' ORDER BY slot_start`);
  assert.deepEqual(history.map((h) => h.rank), [5, 3]);
});

test('a failed slot is recorded, then replaced by a successful retry', { skip }, async () => {
  const http = m.http.createHttpClient({ minIntervalMs: 0, retryDelaysMs: [] });
  const now = new Date('2026-10-19T11:02:00Z');
  routes.set(feedPath(7006), { status: 503, body: 'down' });
  await m.collect.collectDue({ http, now, jitter: false, log: silent });

  let [snap] = await q(`SELECT s.status, s.reasons FROM snapshot s JOIN v_chart c ON c.id = s.chart_id
                        WHERE c.chart_key = 'ph/7006/top-free' AND slot_start = '2026-10-19T11:00:00Z'`);
  assert.equal(snap.status, 'FAILED');
  assert.match(snap.reasons, /HTTP 503/);

  routes.set(feedPath(7006), { status: 200, body: feedBody(range(1, 100)) });
  await m.collect.collectDue({ http, now: new Date('2026-10-19T11:30:00Z'), jitter: false, log: silent });
  [snap] = await q(`SELECT s.status, s.entry_count, r.attempt_count FROM snapshot s
                    JOIN raw_reading r ON r.id = s.raw_reading_id JOIN v_chart c ON c.id = s.chart_id
                    WHERE c.chart_key = 'ph/7006/top-free' AND s.slot_start = '2026-10-19T11:00:00Z'`);
  assert.deepEqual(snap, { status: 'VALID', entry_count: 100, attempt_count: 2 });
});

test('importing a saved JSON file, and a short reading marked INCOMPLETE', { skip }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'feed-'));
  const file = join(dir, 'feed.json');
  await writeFile(file, feedBody(range(1, 12)));
  const r = await m.collect.importFile(file, 'ph:7006:TOP_FREE', '2026-10-19T12:00:00Z', { log: silent });
  assert.equal(r.status, 'INCOMPLETE');
  assert.equal(r.entries, 12);
  // Rankings are still stored for a short but well-formed reading.
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM ranking WHERE snapshot_id = $1`, [r.snapshotId]);
  assert.equal(n, 12);
  // Importing the same slot again is a no-op.
  assert.equal(await m.collect.importFile(file, 'ph:7006:TOP_FREE', '2026-10-19T12:00:00Z', { log: silent }), null);
});
