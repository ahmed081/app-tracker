// All settings come from environment variables (see .env.example).

// Load .env when present (Docker passes real env vars instead). Existing vars win.
try { process.loadEnvFile(); } catch { /* no .env file */ }

const num = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value));

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/apptracker',

  // Apple endpoints. Overridable so tests can point at a local mock.
  appleBaseUrl: (process.env.APPLE_BASE_URL ?? 'https://itunes.apple.com').replace(/\/$/, ''),
  userAgent: process.env.USER_AGENT ?? 'app-tracker-collector/1.0 (contact: you@example.com)',

  http: {
    timeoutMs: num(process.env.HTTP_TIMEOUT_MS, 20_000),
    retryDelaysMs: (process.env.HTTP_RETRY_DELAYS_MS ?? '10000,30000,60000')
      .split(',')
      .filter((s) => s.trim() !== '')
      .map(Number),
    minIntervalMs: num(process.env.HTTP_MIN_INTERVAL_MS, 1_000), // at most 1 request/second
  },

  scheduler: {
    tickMs: num(process.env.SCHEDULER_TICK_MS, 60_000),
    jitterMaxSeconds: num(process.env.JITTER_MAX_SECONDS, 60),
    retryAfterMinutes: num(process.env.RETRY_AFTER_MINUTES, 5),
    genreSyncDays: num(process.env.GENRE_SYNC_DAYS, 7),
  },

  validation: {
    // A reading with fewer entries than this is INCOMPLETE.
    minEntries: num(process.env.MIN_ENTRIES, 25),
  },
};
