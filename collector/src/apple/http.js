// Shared HTTP client for every Apple call:
// timeouts, a polite User-Agent, at most one request per interval,
// and retries on network errors, 429 and 5xx (never on other 4xx).

import { config } from '../config.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Should a failed attempt be retried? `status` is null for network errors. */
export function isRetryable(status) {
  return status === null || status === 429 || status >= 500;
}

/** Retry-After header in seconds (or an HTTP date) → milliseconds, or null. */
export function retryAfterMs(header, now = Date.now()) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export function createHttpClient({
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  timeoutMs = config.http.timeoutMs,
  retryDelaysMs = config.http.retryDelaysMs,
  minIntervalMs = config.http.minIntervalMs,
  userAgent = config.userAgent,
} = {}) {
  let lastRequestAt = 0;

  async function throttle() {
    const wait = lastRequestAt + minIntervalMs - Date.now();
    if (wait > 0) await sleepImpl(wait);
    lastRequestAt = Date.now();
  }

  /**
   * Fetch a URL as text. Never throws: returns
   * { ok, status, contentType, body, error, attempts }.
   */
  async function getText(url) {
    let attempts = 0;
    let last = { ok: false, status: null, contentType: null, body: null, error: 'not attempted' };

    for (;;) {
      attempts += 1;
      await throttle();

      let retryAfter = null;
      try {
        const res = await fetchImpl(url, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json, text/javascript, */*' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        // Apple sends JSON as text/javascript: always read the body as text.
        const body = await res.text();
        last = {
          ok: res.ok,
          status: res.status,
          contentType: res.headers.get('content-type'),
          body,
          error: res.ok ? null : `HTTP ${res.status}`,
        };
        if (res.ok || !isRetryable(res.status)) return { ...last, attempts };
        retryAfter = retryAfterMs(res.headers.get('retry-after'));
      } catch (err) {
        last = { ok: false, status: null, contentType: null, body: null, error: `network: ${err.message}` };
      }

      if (attempts > retryDelaysMs.length) {
        return { ...last, error: `${last.error} after ${attempts} attempts`, attempts };
      }
      await sleepImpl(retryAfter ?? retryDelaysMs[attempts - 1]);
    }
  }

  return { getText };
}
