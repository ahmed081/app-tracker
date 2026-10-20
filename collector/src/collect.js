// Fetch a chart from Apple, archive the response in raw_reading, then
// ingest it into history. Also used to import a saved JSON file.

import { readFile } from 'node:fs/promises';
import { pool } from './db.js';
import { config } from './config.js';
import { SOURCE, buildFeedUrl } from './apple/feed.js';
import { sleep } from './apple/http.js';
import { syncCharts, dueCharts, findChartBySpec } from './charts.js';
import { ingestRawReading } from './ingest.js';
import { slotStart } from './slot.js';

/**
 * Save one response for (chart, slot). A slot that already has a successful
 * reading is never changed; a failed one is replaced by a later success.
 * Returns the raw_reading id, or null if the slot was already done.
 */
export async function storeRawReading({ chartId, slot, collectedAt, source, url, response }) {
  const { rows } = await pool.query(
    `INSERT INTO raw_reading (chart_id, slot_start, collected_at, source, url,
                              http_status, content_type, body, error, attempt_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (chart_id, slot_start) DO UPDATE
        SET collected_at  = EXCLUDED.collected_at,
            source        = EXCLUDED.source,
            url           = EXCLUDED.url,
            http_status   = EXCLUDED.http_status,
            content_type  = EXCLUDED.content_type,
            body          = EXCLUDED.body,
            error         = EXCLUDED.error,
            attempt_count = raw_reading.attempt_count + EXCLUDED.attempt_count,
            processed_at  = NULL
        WHERE raw_reading.error IS NOT NULL
     RETURNING id`,
    [chartId, slot, collectedAt, source, url, response.status, response.contentType,
     response.body, response.ok ? null : response.error, response.attempts ?? 1],
  );
  return rows[0]?.id ?? null;
}

/** Collect one chart for its current slot. */
export async function collectChart(chart, { http, now = new Date(), log = console.log }) {
  const slot = chart.slot ?? slotStart(now, chart.interval_minutes);
  const url = buildFeedUrl({
    countryCode: chart.country_code,
    chartType: chart.chart_type,
    genreId: chart.genre_id,
    depth: chart.depth,
  });

  await pool.query(`UPDATE chart SET last_attempt_at = $2 WHERE id = $1`, [chart.id, now]);
  const response = await http.getText(url);
  const rawId = await storeRawReading({
    chartId: chart.id, slot, collectedAt: new Date(), source: SOURCE, url, response,
  });
  if (rawId === null) {
    log(`collect ${chart.chart_key} slot=${slot.toISOString()} already collected, nothing stored`);
    return null;
  }

  const result = await ingestRawReading(rawId);
  log(
    `collect ${chart.chart_key} slot=${slot.toISOString()} http=${response.status ?? '-'} ` +
    `entries=${result.entries} status=${result.status}` +
    (result.feedUpdatedAt ? ` feed_updated=${result.feedUpdatedAt.toISOString()}` : '') +
    (result.reasons?.length ? ` reasons=${result.reasons.join(';')}` : ''),
  );
  return { rawId, ...result };
}

/** One scheduler pass: sync charts from config, then collect every due chart. */
export async function collectDue({ http, now = new Date(), jitter = true, log = console.log }) {
  await syncCharts();
  const due = await dueCharts(now, config.scheduler.retryAfterMinutes);
  const results = [];
  for (const chart of due) {
    if (jitter && config.scheduler.jitterMaxSeconds > 0) {
      await sleep(Math.random() * config.scheduler.jitterMaxSeconds * 1000);
    }
    try {
      results.push(await collectChart(chart, { http, now, log }));
    } catch (err) {
      log(`collect ${chart.chart_key} error: ${err.message}`);
    }
  }
  return results;
}

/**
 * Import a saved feed file as the reading of `spec` ("ph:7006:TOP_FREE") for `slot`.
 * `slot` defaults to the current slot.
 */
export async function importFile(path, spec, slot, { log = console.log } = {}) {
  await syncCharts();
  const chart = await findChartBySpec(spec);
  if (!chart) {
    throw new Error(`No chart ${spec}. Enable its country and genre and add a tracking row first.`);
  }
  const body = await readFile(path, 'utf8');
  const slotDate = slotStart(slot ? new Date(slot) : new Date(), chart.interval_minutes);
  const rawId = await storeRawReading({
    chartId: chart.id,
    slot: slotDate,
    collectedAt: slot ? slotDate : new Date(),
    source: 'file-import',
    url: `file:${path}`,
    response: { ok: true, status: null, contentType: 'application/json', body, error: null, attempts: 1 },
  });
  if (rawId === null) {
    log(`import ${chart.chart_key} slot=${slotDate.toISOString()} already has a reading, skipped`);
    return null;
  }
  const result = await ingestRawReading(rawId);
  log(`import ${chart.chart_key} slot=${slotDate.toISOString()} entries=${result.entries} status=${result.status}`);
  return { rawId, ...result };
}
