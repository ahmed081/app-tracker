// Keeps the `genre` table in line with Apple's genre tree.
// New genres arrive DISABLED. Your `enabled` switch is never touched.
// Genres missing from Apple's tree get available_on_apple = false (never deleted).

import { withTransaction } from './db.js';
import { buildGenreTreeUrl, parseGenreTree } from './apple/genres.js';

export async function syncGenresFromBody(body, now = new Date()) {
  const genres = parseGenreTree(body);
  // Parents before children so the parent_id foreign key is always satisfied.
  const depth = new Map();
  const byId = new Map(genres.map((g) => [g.id, g]));
  const depthOf = (g) => {
    if (depth.has(g.id)) return depth.get(g.id);
    const d = g.parentId && byId.has(g.parentId) ? depthOf(byId.get(g.parentId)) + 1 : 0;
    depth.set(g.id, d);
    return d;
  };
  genres.sort((a, b) => depthOf(a) - depthOf(b));

  return withTransaction(async (db) => {
    let added = 0;
    for (const g of genres) {
      const { rows } = await db.query(
        `INSERT INTO genre (id, name, parent_id, enabled, available_on_apple, synced_at)
         VALUES ($1, $2, $3, false, true, $4)
         ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                parent_id = EXCLUDED.parent_id,
                available_on_apple = true,
                synced_at = EXCLUDED.synced_at,
                updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [g.id, g.name, g.parentId, now],
      );
      if (rows[0].inserted) added += 1;
    }
    const { rowCount: removed } = await db.query(
      `UPDATE genre SET available_on_apple = false, updated_at = now()
       WHERE available_on_apple AND NOT (id = ANY($1::int[]))`,
      [genres.map((g) => g.id)],
    );
    return { total: genres.length, added, removed };
  });
}

export async function syncGenres(http) {
  const res = await http.getText(buildGenreTreeUrl());
  if (!res.ok) throw new Error(`genre sync failed: ${res.error}`);
  return syncGenresFromBody(res.body);
}
