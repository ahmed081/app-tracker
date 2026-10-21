// Development-only fake API: serves recorded responses from mock/fixtures in the
// exact shapes of the backend, so the UI can be built and reviewed without it.
// The Settings API (/api/manage) and the watchlist (/api/watch) are in-memory
// fakes (mock-manage-api.ts, mock-watch-api.ts).
import type { Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleManage } from './mock-manage-api.ts';
import { handleWatch } from './mock-watch-api.ts';

const ROOT = fileURLToPath(new URL('./fixtures', import.meta.url));
const WINDOWS = ['1h', '24h', '7d', '30d'];

type Json = Record<string, unknown> & { [key: string]: any };

function load(path: string): Json | null {
  const file = join(ROOT, path);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

function nearestWindow(w: string | null): string {
  return w && WINDOWS.includes(w) ? w : w === '3m' || w === '1y' || w === 'all' ? '30d' : '24h';
}

function handle(url: URL, method = 'GET', body: Json = {}): { status: number; body: unknown } {
  const p = url.pathname.replace(/\/+$/, '');
  const qs = url.searchParams;
  const notFound = (detail: string) => ({ status: 404, body: { status: 404, detail } });

  if (p.startsWith('/api/manage/')) return handleManage(p, method, body, load('charts.json') as unknown as Json[]);
  if (p === '/api/watch' || p.startsWith('/api/watch/')) return handleWatch(p, method, body, qs, load);

  if (p === '/api/charts') return { status: 200, body: load('charts.json') };

  let m = p.match(/^\/api\/charts\/([a-z]{2})\/(\d+)\/([a-z-]+)\/(ranking|headlines|movers|events|bump)$/);
  if (m) {
    const [, country, genre, type, kind] = m;
    const base = `chart/${country}/${genre}/${type}`;
    if (!existsSync(join(ROOT, base))) return notFound(`No chart ${country}/${genre}/${type}`);
    if (kind === 'ranking') {
      const data = load(`${base}/ranking.${nearestWindow(qs.get('window'))}.json`)!;
      const limit = Number(qs.get('limit') ?? 25);
      return { status: 200, body: { ...data, rows: data.rows.slice(0, limit) } };
    }
    if (kind === 'headlines' || kind === 'movers') {
      return { status: 200, body: load(`${base}/${kind}.${nearestWindow(qs.get('window'))}.json`) };
    }
    if (kind === 'bump') return { status: 200, body: load(`${base}/bump.7d.json`) };
    const data = load(`${base}/events.json`)!;
    const min = Number(qs.get('minImportance') ?? 2);
    const primaryOnly = qs.get('primaryOnly') !== 'false';
    const types = qs.getAll('types').flatMap((t) => t.split(',')).filter(Boolean);
    const since = qs.get('since');
    const events = (data.events as Json[]).filter((e) => e.importance >= min && (!primaryOnly || e.primary)
      && (types.length === 0 || types.includes(e.type)) && (!since || e.at > since));
    return { status: 200, body: { ...data, events: events.slice(0, Number(qs.get('limit') ?? 50)) } };
  }

  m = p.match(/^\/api\/apps\/(\d+)(?:\/(history|events|versions|ratings))?$/);
  if (m) {
    const [, id, kind] = m;
    if (!existsSync(join(ROOT, `apps/${id}.json`))) return notFound(`No app ${id}`);
    if (!kind) return { status: 200, body: load(`apps/${id}.json`) };
    if (kind === 'history') {
      const chart = (qs.get('chart') ?? '').replaceAll('/', '_');
      const range = qs.get('range') ?? '30d';
      const data = load(`apps/${id}/history/${chart}.${range}.json`);
      return data ? { status: 200, body: data } : notFound(`No history for ${qs.get('chart')}`);
    }
    if (kind === 'events') {
      const min = Number(qs.get('minImportance') ?? 1);
      return { status: 200, body: (load(`apps/${id}/events.json`) as unknown as Json[]).filter((e) => e.importance >= min) };
    }
    return { status: 200, body: load(`apps/${id}/${kind}.json`) };
  }

  if (p === '/api/search') {
    const q = (qs.get('q') ?? '').trim().toLowerCase();
    if (q.length < 2) return { status: 400, body: { status: 400, detail: 'Search needs at least 2 characters' } };
    const index = load('search-index.json') as unknown as Json[];
    const hits = index.filter((r) => r.app.name.toLowerCase().includes(q) || (r.app.developer ?? '').toLowerCase().includes(q)
      || r.app.appleAppId === q || r.bundleId === q);
    return { status: 200, body: hits.slice(0, Number(qs.get('limit') ?? 20)).map((r) => ({ app: r.app, charts: r.charts })) };
  }

  return notFound(`Unknown endpoint ${p}`);
}

export function mockApi(): Plugin {
  return {
    name: 'app-tracker-mock-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = req.url;
        void readBody(req).then((requestBody) => {
          const { status, body } = handle(new URL(url, 'http://localhost'), req.method ?? 'GET', requestBody);
          // A little latency so loading and saving states are visible during development.
          setTimeout(() => {
            res.statusCode = status;
            res.setHeader('content-type', status < 300 ? 'application/json' : 'application/problem+json');
            res.end(JSON.stringify(body));
          }, 150);
        });
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<Json> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}
