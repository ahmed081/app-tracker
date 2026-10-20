// Turns the tracking configuration into `chart` rows, and finds charts due
// for collection. Switching something off only deactivates charts.

import { pool, withTransaction } from './db.js';
import { slotStart } from './slot.js';

/** Make `chart` match v_tracking_target. Returns { activated, deactivated }. */
export async function syncCharts() {
  return withTransaction(async (db) => {
    const { rowCount: activated } = await db.query(
      `INSERT INTO chart (country_code, genre_id, chart_type, depth, interval_minutes, active)
       SELECT country_code, genre_id, chart_type, depth, interval_minutes, true
       FROM v_tracking_target
       ON CONFLICT (country_code, genre_id, chart_type) DO UPDATE
          SET depth = EXCLUDED.depth,
              interval_minutes = EXCLUDED.interval_minutes,
              active = true,
              updated_at = now()
          WHERE chart.active IS DISTINCT FROM true
             OR chart.depth <> EXCLUDED.depth
             OR chart.interval_minutes <> EXCLUDED.interval_minutes`,
    );
    const { rowCount: deactivated } = await db.query(
      `UPDATE chart c SET active = false, updated_at = now()
       WHERE c.active
         AND NOT EXISTS (
           SELECT 1 FROM v_tracking_target t
           WHERE t.country_code = c.country_code
             AND t.genre_id = c.genre_id
             AND t.chart_type = c.chart_type)`,
    );
    return { activated, deactivated };
  });
}

/**
 * Active charts whose current slot has no successful reading yet and whose
 * last attempt is older than `retryAfterMinutes`.
 */
export async function dueCharts(now, retryAfterMinutes) {
  const { rows } = await pool.query(
    `SELECT c.*, vc.chart_key
     FROM chart c
     JOIN v_chart vc ON vc.id = c.id
     WHERE c.active
       AND (c.last_attempt_at IS NULL
            OR c.last_attempt_at < $1::timestamptz - make_interval(mins => $2::int))
     ORDER BY c.id`,
    [now, retryAfterMinutes],
  );
  const due = [];
  for (const chart of rows) {
    const slot = slotStart(now, chart.interval_minutes);
    const { rows: done } = await pool.query(
      `SELECT 1 FROM raw_reading WHERE chart_id = $1 AND slot_start = $2 AND error IS NULL`,
      [chart.id, slot],
    );
    if (done.length === 0) due.push({ ...chart, slot });
  }
  return due;
}

/** Find a chart by "country:genreId:chartType", e.g. "ph:7006:TOP_FREE". */
export async function findChartBySpec(spec) {
  const [countryCode, genreId, chartType] = String(spec).split(':');
  const { rows } = await pool.query(
    `SELECT c.*, vc.chart_key FROM chart c JOIN v_chart vc ON vc.id = c.id
     WHERE c.country_code = $1 AND c.genre_id = $2 AND c.chart_type = $3`,
    [countryCode?.toLowerCase(), Number(genreId), chartType?.toUpperCase()],
  );
  return rows[0] ?? null;
}
