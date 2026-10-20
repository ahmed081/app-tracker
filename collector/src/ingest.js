// Turns a stored raw_reading into history: snapshot, developers, apps,
// listing versions and rankings. Safe to run more than once.
// Run it over all unprocessed readings in slot order to (re)build history.

import { createHash } from 'node:crypto';
import { pool, withTransaction } from './db.js';
import { config } from './config.js';
import { parseFeed } from './apple/feed.js';

/** Decide the snapshot status from a parsed feed. Pure function. */
export function validate(parsed, { minEntries = config.validation.minEntries, fetchError = null } = {}) {
  if (fetchError) return { status: 'FAILED', reasons: [`fetch_error:${fetchError}`], writeRankings: false };
  if (!parsed.ok) return { status: 'FAILED', reasons: [parsed.error], writeRankings: false };
  if (parsed.entries.length === 0) return { status: 'FAILED', reasons: ['zero_entries'], writeRankings: false };

  const reasons = [];
  const seen = new Set();
  for (const e of parsed.entries) {
    if (!e.appleAppId || !/^\d+$/.test(e.appleAppId)) reasons.push(`invalid_app_id:rank_${e.rank}`);
    else if (seen.has(e.appleAppId)) reasons.push(`duplicate_app_id:${e.appleAppId}`);
    else seen.add(e.appleAppId);
    if (!e.name) reasons.push(`missing_name:rank_${e.rank}`);
  }
  // Structural problems: keep the snapshot, but write no rankings.
  if (reasons.length > 0) return { status: 'INCOMPLETE', reasons, writeRankings: false };

  if (parsed.entries.length < minEntries) {
    return { status: 'INCOMPLETE', reasons: [`below_min_entries:${parsed.entries.length}`], writeRankings: true };
  }
  return { status: 'VALID', reasons: [], writeRankings: true };
}

/** Hash of every listing field, to detect listing changes. */
export function listingHash(e) {
  const fields = [
    e.name, e.title, e.summary, e.priceAmount, e.currency, e.categoryId,
    e.categoryName, e.rights, e.iconUrl, e.previewUrl, e.storeUrl,
  ];
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

async function upsertDeveloper(db, dev, seenAt) {
  if (!dev) return null;
  const { rows } = await db.query(
    `INSERT INTO developer (apple_developer_id, name, url, first_seen_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (apple_developer_id) DO UPDATE
        SET name = EXCLUDED.name,
            url = COALESCE(EXCLUDED.url, developer.url),
            first_seen_at = LEAST(developer.first_seen_at, EXCLUDED.first_seen_at)
     RETURNING id`,
    [dev.appleDeveloperId, dev.name, dev.url, seenAt],
  );
  return rows[0].id;
}

async function upsertApp(db, e, developerId, seenAt, snapshotId) {
  const { rows } = await db.query(
    `INSERT INTO app (apple_app_id, bundle_id, developer_id, release_date,
                      first_seen_at, first_seen_snapshot_id, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $5)
     ON CONFLICT (apple_app_id) DO UPDATE
        SET bundle_id    = COALESCE(EXCLUDED.bundle_id, app.bundle_id),
            developer_id = COALESCE(EXCLUDED.developer_id, app.developer_id),
            release_date = COALESCE(EXCLUDED.release_date, app.release_date),
            first_seen_snapshot_id = CASE WHEN EXCLUDED.first_seen_at < app.first_seen_at
                                          THEN EXCLUDED.first_seen_snapshot_id
                                          ELSE app.first_seen_snapshot_id END,
            first_seen_at = LEAST(app.first_seen_at, EXCLUDED.first_seen_at),
            last_seen_at  = GREATEST(app.last_seen_at, EXCLUDED.last_seen_at)
     RETURNING id`,
    [e.appleAppId, e.bundleId, developerId, e.releaseDate, seenAt, snapshotId],
  );
  return rows[0].id;
}

async function upsertListing(db, appId, countryCode, e, seenAt) {
  const hash = listingHash(e);
  const { rows: latest } = await db.query(
    `SELECT id, content_hash FROM app_listing_version
     WHERE app_id = $1 AND country_code = $2
     ORDER BY first_seen_at DESC, id DESC
     LIMIT 1`,
    [appId, countryCode],
  );
  if (latest[0]?.content_hash === hash) {
    await db.query(
      `UPDATE app_listing_version SET last_seen_at = GREATEST(last_seen_at, $2) WHERE id = $1`,
      [latest[0].id, seenAt],
    );
    return latest[0].id;
  }
  const { rows } = await db.query(
    `INSERT INTO app_listing_version
        (app_id, country_code, name, title, summary, price_amount, currency,
         category_id, category_name, rights, icon_url, preview_url, store_url,
         content_hash, first_seen_at, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
     RETURNING id`,
    [appId, countryCode, e.name, e.title, e.summary, e.priceAmount, e.currency,
     e.categoryId, e.categoryName, e.rights, e.iconUrl, e.previewUrl, e.storeUrl,
     hash, seenAt],
  );
  return rows[0].id;
}

/** Process one raw_reading. Returns a short result object. */
export async function ingestRawReading(rawReadingId) {
  return withTransaction(async (db) => {
    const { rows: raws } = await db.query(
      `SELECT r.*, c.country_code, c.depth
       FROM raw_reading r JOIN chart c ON c.id = r.chart_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [rawReadingId],
    );
    const raw = raws[0];
    if (!raw) throw new Error(`raw_reading ${rawReadingId} not found`);

    const { rows: existing } = await db.query(
      `SELECT id, status FROM snapshot WHERE chart_id = $1 AND slot_start = $2 FOR UPDATE`,
      [raw.chart_id, raw.slot_start],
    );
    // A non-failed snapshot for this slot is final.
    if (existing[0] && existing[0].status !== 'FAILED') {
      await db.query(`UPDATE raw_reading SET processed_at = now() WHERE id = $1`, [raw.id]);
      return { snapshotId: existing[0].id, status: existing[0].status, skipped: true };
    }

    const parsed = raw.error ? { ok: false, error: raw.error, entries: [], feedUpdatedAt: null } : parseFeed(raw.body);
    const verdict = validate(parsed, { fetchError: raw.error });
    const slot = raw.slot_start;

    const { rows: earlier } = await db.query(
      `SELECT 1 FROM snapshot WHERE chart_id = $1 AND status = 'VALID' AND slot_start < $2 LIMIT 1`,
      [raw.chart_id, slot],
    );
    const isBaseline = verdict.status === 'VALID' && earlier.length === 0;

    const values = [
      raw.chart_id, raw.id, slot, raw.collected_at, parsed.feedUpdatedAt, raw.depth,
      parsed.entries.length, verdict.status, verdict.reasons.join(';') || null, isBaseline,
    ];
    let snapshotId;
    if (existing[0]) {
      // The only allowed overwrite: a FAILED slot superseded by a successful retry.
      await db.query(
        `UPDATE snapshot SET raw_reading_id = $2, collected_at = $4, feed_updated_at = $5,
                expected_count = $6, entry_count = $7, status = $8, reasons = $9, is_baseline = $10
         WHERE id = $11 AND chart_id = $1 AND slot_start = $3`,
        [...values, existing[0].id],
      );
      snapshotId = existing[0].id;
    } else {
      const { rows } = await db.query(
        `INSERT INTO snapshot (chart_id, raw_reading_id, slot_start, collected_at, feed_updated_at,
                               expected_count, entry_count, status, reasons, is_baseline)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        values,
      );
      snapshotId = rows[0].id;
    }

    if (verdict.writeRankings) {
      for (const e of parsed.entries) {
        const developerId = await upsertDeveloper(db, e.developer, slot);
        const appId = await upsertApp(db, e, developerId, slot, snapshotId);
        const listingId = await upsertListing(db, appId, raw.country_code, e, slot);
        await db.query(
          `INSERT INTO ranking (snapshot_id, rank, app_id, listing_version_id, chart_id, slot_start)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [snapshotId, e.rank, appId, listingId, raw.chart_id, slot],
        );
      }
    }

    if (verdict.status === 'VALID') {
      await db.query(
        `UPDATE chart SET last_valid_snapshot_at = GREATEST(last_valid_snapshot_at, $2), updated_at = now()
         WHERE id = $1`,
        [raw.chart_id, slot],
      );
    }
    await db.query(`UPDATE raw_reading SET processed_at = now() WHERE id = $1`, [raw.id]);

    return {
      snapshotId,
      status: verdict.status,
      reasons: verdict.reasons,
      entries: parsed.entries.length,
      feedUpdatedAt: parsed.feedUpdatedAt,
      skipped: false,
    };
  });
}

/** Process every unprocessed raw reading, oldest slot first. */
export async function ingestPending({ log = console.log } = {}) {
  const { rows } = await pool.query(
    `SELECT id FROM raw_reading WHERE processed_at IS NULL ORDER BY slot_start, id`,
  );
  const results = [];
  for (const { id } of rows) {
    const result = await ingestRawReading(id);
    log(`ingest raw_reading=${id} snapshot=${result.snapshotId} status=${result.status}` +
        (result.skipped ? ' (slot already had a snapshot)' : ` entries=${result.entries}`));
    results.push(result);
  }
  return results;
}
