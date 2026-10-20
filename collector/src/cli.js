#!/usr/bin/env node
// Command line entry point. See README.md for usage.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, closePool } from './db.js';
import { config } from './config.js';
import { createHttpClient, sleep } from './apple/http.js';
import { syncGenres } from './genres.js';
import { syncCharts } from './charts.js';
import { collectDue, importFile } from './collect.js';
import { ingestPending } from './ingest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

async function runSqlFile(name) {
  const sql = await readFile(join(root, 'db', name), 'utf8');
  await pool.query(sql);
  log(`applied db/${name}`);
}

// Only one collector may run at a time against the same database.
const LOCK_KEY = 4_242_001;

async function runForever(http) {
  const lockClient = await pool.connect();
  const { rows } = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
  if (!rows[0].ok) {
    lockClient.release();
    throw new Error('Another collector is already running against this database.');
  }
  log(`collector started (tick ${config.scheduler.tickMs / 1000}s)`);

  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { stopping = true; log(`${sig} received, stopping after this pass`); });
  }

  let lastGenreSync = 0;
  while (!stopping) {
    const started = Date.now();
    try {
      if (started - lastGenreSync > config.scheduler.genreSyncDays * 86_400_000) {
        try {
          const r = await syncGenres(http);
          log(`genres synced: ${r.total} total, ${r.added} new (disabled), ${r.removed} gone from Apple`);
        } catch (err) {
          log(`genre sync skipped: ${err.message}`);
        }
        lastGenreSync = started;
      }
      await collectDue({ http, log });
    } catch (err) {
      log(`pass failed: ${err.message}`);
    }
    const wait = config.scheduler.tickMs - (Date.now() - started);
    for (let waited = 0; waited < wait && !stopping; waited += 1000) await sleep(1000);
  }
  lockClient.release();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const http = createHttpClient();

  switch (command) {
    case 'db:schema':
      await runSqlFile('schema.sql');
      break;
    case 'db:seed':
      await runSqlFile('seed.sql');
      break;
    case 'sync-genres': {
      const r = await syncGenres(http);
      log(`genres synced: ${r.total} total, ${r.added} new (disabled), ${r.removed} gone from Apple`);
      break;
    }
    case 'sync-charts': {
      const r = await syncCharts();
      log(`charts: ${r.activated} activated/updated, ${r.deactivated} deactivated`);
      break;
    }
    case 'collect':          // one pass now, without jitter
      await collectDue({ http, jitter: false, log });
      break;
    case 'ingest':           // (re)process every unprocessed raw reading
      await ingestPending({ log });
      break;
    case 'import': {         // import <file> <country:genre:type> [slot ISO time]
      const [file, spec, slot] = args;
      if (!file || !spec) throw new Error('usage: import <file.json> <ph:7006:TOP_FREE> [2026-10-19T10:00:00Z]');
      await importFile(file, spec, slot, { log });
      break;
    }
    case 'run':
      await runForever(http);
      break;
    default:
      console.log('commands: db:schema | db:seed | sync-genres | sync-charts | collect | ingest | import | run');
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .catch((err) => {
    // AggregateError (e.g. ECONNREFUSED on both ::1 and 127.0.0.1) has an empty message.
    const detail = err.message || err.errors?.map((e) => e.message).join('; ') || err.code || String(err);
    console.error(`error: ${detail}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
