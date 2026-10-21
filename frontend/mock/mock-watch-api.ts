// Development-only fake of the watchlist API (/api/watch), kept in memory:
// changes last until the dev server restarts. Same shapes, rules and status
// codes as the backend (400 with {"errors": {...}}, 404), no admin key.
// Ranks, trends and events come from the recorded chart fixtures.
type Json = Record<string, any>;
type Load = (path: string) => Json | null;

const PRESETS = ['IMPORTANT', 'ALL', 'CUSTOM'];
const CUSTOM_CHOICES = ['REACHED_NUMBER_ONE', 'LOST_NUMBER_ONE', 'ENTERED_TOP_N', 'LEFT_TOP_N', 'LEFT_CHART', 'BIG_MOVE',
  'RISING_STARTED', 'NEW_ENTRY', 'RE_ENTRY', 'NEW_VERSION', 'MOVED_UP', 'MOVED_DOWN'];
const TIERS = [10, 5];
const HIGHEST_TIER = Math.max(...TIERS);
const WINDOWS = ['1h', '24h', '7d', '30d'];

let nextId = 1;
const now = () => new Date().toISOString();
const important = () => ({ preset: 'IMPORTANT', eventTypes: null, minPlaces: null, tiers: null });

function newWatch(kind: string, appleAppId: string | null, chartKey: string | null): Json {
  return { id: nextId++, kind, appleAppId, chartKey, active: true, rule: kind === 'APP' ? important() : null, createdAt: now(), updatedAt: now() };
}

// A few watches to start with, so the screens have something to show.
const watches: Json[] = [
  newWatch('APP', '900000011', 'ph/7006/top-free'),
  newWatch('APP', '900000002', null),
  newWatch('CHART', null, 'ph/7006/top-free'),
];

const invalid = (errors: Json) => ({ status: 400, body: { status: 400, detail: `Invalid fields: [${Object.keys(errors).join(', ')}]`, errors } });

export function handleWatch(p: string, method: string, body: Json, qs: URLSearchParams, load: Load): { status: number; body: unknown } {
  const charts = (load('charts.json') ?? []) as unknown as Json[];
  const index = (load('search-index.json') ?? []) as unknown as Json[];

  if (p === '/api/watch/status' && method === 'GET') {
    const app = qs.get('appleAppId');
    const chart = qs.get('chartKey');
    return {
      status: 200,
      body: watches.filter((w) => w.active && (!app || w.appleAppId === app) && (!chart || w.chartKey === null || w.chartKey === chart)),
    };
  }

  if (p === '/api/watch' && method === 'GET') return { status: 200, body: watchlist(qs.get('window') ?? '24h', charts, index, load) };

  if (p === '/api/watch' && method === 'POST') {
    const errors: Json = {};
    const kind = body.kind;
    if (kind !== 'APP' && kind !== 'CHART') errors.kind = 'APP or CHART';
    if (kind === 'APP' && !index.some((r) => r.app.appleAppId === body.appleAppId)) errors.appleAppId = `Unknown app ${body.appleAppId}`;
    if (kind === 'CHART' && body.appleAppId) errors.appleAppId = 'A chart watch follows no app';
    if (kind === 'CHART' && !body.chartKey) errors.chartKey = 'Required';
    if (body.chartKey && !charts.some((c) => c.key === body.chartKey)) errors.chartKey = `Unknown chart ${body.chartKey}`;
    if (Object.keys(errors).length) return invalid(errors);
    const appleAppId = kind === 'APP' ? body.appleAppId : null;
    const chartKey = body.chartKey ?? null;
    let w = watches.find((x) => x.kind === kind && x.appleAppId === appleAppId && x.chartKey === chartKey);
    if (w) Object.assign(w, { active: true, updatedAt: now() });     // following again keeps the rule
    else watches.push(w = newWatch(kind, appleAppId, chartKey));
    return { status: 200, body: w };
  }

  const m = p.match(/^\/api\/watch\/(\d+)$/);
  if (m && method === 'PUT') {
    const w = watches.find((x) => x.id === Number(m[1]));
    if (!w) return { status: 404, body: { status: 404, detail: `No watch ${m[1]}` } };
    if (body.rule) {
      if (w.kind === 'CHART') return invalid({ rule: 'A chart watch alerts on its big moments; its rule cannot change' });
      const r = body.rule;
      const errors: Json = {};
      if (!PRESETS.includes(r.preset)) errors.preset = `One of ${PRESETS}`;
      if (r.preset === 'CUSTOM') {
        if (!r.eventTypes?.length) errors.eventTypes = 'Pick at least one event type';
        else if (!r.eventTypes.every((t: string) => CUSTOM_CHOICES.includes(t))) errors.eventTypes = `Among ${CUSTOM_CHOICES}`;
        if (r.minPlaces != null && (r.minPlaces < 1 || r.minPlaces > 200)) errors.minPlaces = 'Must be between 1 and 200';
        if (r.tiers != null && (!r.tiers.length || !r.tiers.every((t: number) => TIERS.includes(t)))) errors.tiers = `Among the configured tiers ${TIERS}`;
      }
      if (Object.keys(errors).length) return invalid(errors);
      w.rule = r.preset === 'CUSTOM'
        ? { preset: 'CUSTOM', eventTypes: [...new Set(r.eventTypes)], minPlaces: r.minPlaces ?? 10, tiers: r.tiers ?? null }
        : { preset: r.preset, eventTypes: null, minPlaces: null, tiers: null };
    }
    if (typeof body.active === 'boolean') w.active = body.active;
    w.updatedAt = now();
    return { status: 200, body: w };
  }

  return { status: 404, body: { status: 404, detail: `Unknown endpoint ${method} ${p}` } };
}

function watchlist(window: string, charts: Json[], index: Json[], load: Load) {
  const w = WINDOWS.includes(window) ? window : '24h';
  const ranking = (key: string) => load(`chart/${key}/ranking.${w}.json`);
  const events = (key: string) => ((load(`chart/${key}/events.json`)?.events ?? []) as Json[]);
  const card = (appleAppId: string) => index.find((r) => r.app.appleAppId === appleAppId)?.app ?? null;

  const line = (watch: Json, appleAppId: string, key: string) => {
    const data = ranking(key);
    const row = (data?.rows as Json[] | undefined)?.find((r) => r.app.appleAppId === appleAppId);
    const last = events(key).find((e) => e.app?.appleAppId === appleAppId && e.importance >= 2 && e.primary) ?? null;
    return {
      watchId: watch.id, allCharts: watch.chartKey === null, rule: watch.rule, chart: key, app: row?.app ?? card(appleAppId),
      currentRank: row?.rank ?? null, windowChange: row?.windowChange ?? null,
      windowStatus: !data ? 'NO_DATA' : row ? row.windowStatus : 'OUT', trend: row?.trend ?? [], lastEvent: last,
    };
  };

  const apps: Json[] = [];
  const watchedCharts: Json[] = [];
  for (const watch of watches.filter((x) => x.active)) {
    if (watch.kind === 'CHART') {
      const chart = charts.find((c) => c.key === watch.chartKey);
      const rows = (ranking(watch.chartKey)?.rows ?? []) as Json[];
      const top = rows.find((r) => r.rank === 1);
      const since = load(`chart/${watch.chartKey}/headlines.24h.json`)?.numberOne?.since ?? null;
      const lastKeyMove = events(watch.chartKey).find((e) => !e.gap && (e.type === 'REACHED_NUMBER_ONE'
        || (e.type === 'ENTERED_TOP_N' && e.tier === HIGHEST_TIER) || (e.type === 'NEW_ENTRY' && e.currentRank <= HIGHEST_TIER))) ?? null;
      if (chart) watchedCharts.push({ watchId: watch.id, chart, numberOne: top ? { app: top.app, since } : null, lastKeyMove });
      continue;
    }
    const keys: string[] = watch.chartKey ? [watch.chartKey]
      : ((index.find((r) => r.app.appleAppId === watch.appleAppId)?.charts ?? []) as Json[]).map((c) => c.chart);
    if (keys.length === 0) {
      apps.push({ watchId: watch.id, allCharts: true, rule: watch.rule, chart: null, app: card(watch.appleAppId),
        currentRank: null, windowChange: null, windowStatus: 'OUT', trend: [], lastEvent: null });
    }
    for (const key of keys) apps.push(line(watch, watch.appleAppId, key));
  }
  apps.sort((a, b) => (a.currentRank ?? Infinity) - (b.currentRank ?? Infinity));
  const asOf = charts.map((c) => c.asOf).filter(Boolean).sort().at(-1) ?? null;
  return { window: w, asOf, apps, charts: watchedCharts };
}
