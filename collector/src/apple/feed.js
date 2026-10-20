// The ONLY place that knows the shape of Apple's legacy RSS JSON feed.
// Everything else works with the normalized entries returned by parseFeed().

import { config } from '../config.js';

export const SOURCE = 'apple-legacy-rss-v1';

export const FEED_TYPES = {
  TOP_FREE: 'topfreeapplications',
  TOP_PAID: 'toppaidapplications',
  TOP_GROSSING: 'topgrossingapplications',
};

export function buildFeedUrl({ countryCode, chartType, genreId, depth }, baseUrl = config.appleBaseUrl) {
  const feedType = FEED_TYPES[chartType];
  if (!feedType) throw new Error(`Unknown chart type: ${chartType}`);
  const limit = Math.min(Math.max(Number(depth) || 200, 1), 200);
  const genre = genreId ? `/genre=${genreId}` : '';
  return `${baseUrl}/${countryCode}/rss/${feedType}/limit=${limit}${genre}/json`;
}

// "x" | [x, y] | undefined  →  array
const asArray = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);

const label = (node) => (node && typeof node.label === 'string' ? node.label : null);

/** "2026-10-19T03:00:00-07:00" → Date in UTC, or null. */
export function parseAppleDate(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Date part as written by Apple, e.g. "2025-04-07T00:00:00-07:00" → "2025-04-07". */
function datePart(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? '');
  return match ? match[1] : null;
}

function developerFrom(entry) {
  const artist = entry['im:artist'];
  const name = label(artist);
  if (!name) return null;
  const url = artist?.attributes?.href ?? null;
  const match = /\/id(\d+)/.exec(url ?? '');
  // Some developers have no page link; fall back to a name-based key.
  const appleDeveloperId = match ? match[1] : `name:${name}`;
  return { appleDeveloperId, name, url };
}

function normalizeEntry(entry, index) {
  const idAttrs = entry?.id?.attributes ?? {};
  const links = asArray(entry.link).map((l) => l?.attributes ?? {});
  const images = asArray(entry['im:image'])
    .map((img) => ({ url: label(img), height: Number(img?.attributes?.height) || 0 }))
    .filter((img) => img.url)
    .sort((a, b) => b.height - a.height);
  const price = entry['im:price']?.attributes ?? {};
  const category = entry.category?.attributes ?? {};
  const amount = price.amount !== undefined ? Number(price.amount) : null;

  return {
    rank: index + 1,
    appleAppId: idAttrs['im:id'] ?? null,
    bundleId: idAttrs['im:bundleId'] ?? null,
    name: label(entry['im:name']),
    title: label(entry.title),
    summary: label(entry.summary),
    priceAmount: Number.isFinite(amount) ? amount : null,
    currency: price.currency ?? null,
    categoryId: category['im:id'] ? Number(category['im:id']) : null,
    categoryName: category.label ?? null,
    rights: label(entry.rights),
    iconUrl: images[0]?.url ?? null,
    previewUrl: links.find((l) => l.rel === 'enclosure')?.href ?? null,
    storeUrl: links.find((l) => l.rel === 'alternate')?.href ?? label(entry.id),
    releaseDate: datePart(label(entry['im:releaseDate'])),
    developer: developerFrom(entry),
  };
}

/**
 * Parse a feed body (text). Never throws.
 * Returns { ok, error, feedUpdatedAt, entries }.
 */
export function parseFeed(body) {
  if (body === null || body === undefined || body === '') {
    return { ok: false, error: 'empty body', feedUpdatedAt: null, entries: [] };
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch (err) {
    return { ok: false, error: `unparsable body: ${err.message}`, feedUpdatedAt: null, entries: [] };
  }
  const feed = json?.feed;
  if (!feed || typeof feed !== 'object') {
    return { ok: false, error: 'no feed object', feedUpdatedAt: null, entries: [] };
  }
  // entry: array normally, a single object when there is one result, missing when none.
  const entries = asArray(feed.entry).map(normalizeEntry);
  return { ok: true, error: null, feedUpdatedAt: parseAppleDate(label(feed.updated)), entries };
}
