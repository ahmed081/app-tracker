import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ar from './locales/ar.json';
import { createFormatters, flag } from './format';

const PLURAL = /_(zero|one|two|few|many|other)$/;

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}
const base = (k: string) => k.replace(PLURAL, '');

describe('translations', () => {
  const enKeys = new Set(keys(en).map(base));
  const arKeys = new Set(keys(ar).map(base));

  it('English and Arabic have the same keys', () => {
    expect([...enKeys].filter((k) => !arKeys.has(k))).toEqual([]);
    expect([...arKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('Arabic plurals cover every form', () => {
    const plural = keys(ar).filter((k) => PLURAL.test(k)).map(base);
    for (const k of new Set(plural)) {
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
        expect(keys(ar)).toContain(`${k}_${form}`);
      }
    }
  });

  it('every literal key used in the code exists', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) files.push(p);
      }
    };
    walk(join(__dirname, '..'));
    const used = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]!);
    }
    const missing = [...used].filter((k) => k.includes('.') && !enKeys.has(k));
    expect(missing).toEqual([]);
  });
});

describe('formatting', () => {
  const t = (key: string, opts?: Record<string, unknown>) => `${key}:${JSON.stringify(opts ?? {})}`;

  it('keeps Western digits in Arabic so ranks line up', () => {
    const f = createFormatters('ar', t);
    expect(f.rank(12)).toBe('#12');
    expect(f.number(1234)).toMatch(/1.?234/);
  });

  it('formats ranks, relative time and countries', () => {
    const f = createFormatters('en', t);
    expect(f.rank(null)).toBe('—');
    const now = Date.parse('2026-10-19T12:00:00Z');
    expect(f.relative('2026-10-19T11:55:00Z', now)).toBe('5 minutes ago');
    expect(f.relative('2026-10-19T09:00:00Z', now)).toBe('3 hours ago');
    expect(f.country('ph')).toBe('Philippines');
    expect(flag('ph')).toBe('🇵🇭');
  });
});
