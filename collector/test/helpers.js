// Builds realistic feed bodies from the real sample response.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const sampleBody = readFileSync(join(here, 'fixtures', 'ph-casino-sample.json'), 'utf8');
const sample = JSON.parse(sampleBody);
const template = sample.feed.entry[0];

/** One feed entry for a fake app `n` (Apple ID 900000000 + n). */
export function fakeEntry(n, { name = `Test App ${n}`, developer = 1 } = {}) {
  const e = structuredClone(template);
  const id = String(900000000 + n);
  e['im:name'].label = name;
  e.title.label = `${name} - Dev ${developer}`;
  e.id.attributes['im:id'] = id;
  e.id.attributes['im:bundleId'] = `com.test.app${n}`;
  e.id.label = `https://apps.apple.com/ph/app/test/id${id}?uo=2`;
  e['im:artist'].label = `Dev ${developer}`;
  e['im:artist'].attributes.href = `https://apps.apple.com/ph/developer/dev/id${800000000 + developer}?uo=2`;
  e.link[0].attributes.href = e.id.label;
  return e;
}

/** A full feed body whose entries are apps `ids`, in rank order. */
export function feedBody(ids, { updated = '2026-10-19T03:00:00-07:00', names = {} } = {}) {
  const feed = structuredClone(sample);
  feed.feed.entry = ids.map((n) => fakeEntry(n, { name: names[n] ?? `Test App ${n}`, developer: (n % 5) + 1 }));
  feed.feed.updated.label = updated;
  return JSON.stringify(feed);
}

export const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
