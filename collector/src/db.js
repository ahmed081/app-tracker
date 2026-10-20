import pg from 'pg';
import { config } from './config.js';

// Return numeric columns as strings is pg's default; keep it (no precision loss).
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });

/** Run `fn(client)` inside one transaction. Rolls back on any error. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
