// Development-only fake of the Settings API (/api/manage), kept in memory:
// changes last until the dev server restarts. Same shapes, rules and status
// codes as the backend (400 with {"errors": {...}}, 404, 409), no admin key.
type Json = Record<string, any>;

const CHART_TYPES = ['TOP_FREE', 'TOP_PAID', 'TOP_GROSSING'];
const TIER_CHOICES = [3, 5, 10, 20];
const DEFAULT_RULES = { tiers: [10, 5], bigMovePlaces: 5, risingHours: 24, risingGainPercent: 50, risingMinNetPlaces: 10, newBestAfterDays: 7 };

const COUNTRIES: [string, string, boolean][] = [
  ['ph', 'Philippines', true], ['us', 'United States', false], ['gb', 'United Kingdom', false], ['ca', 'Canada', false],
  ['au', 'Australia', false], ['id', 'Indonesia', false], ['my', 'Malaysia', false], ['sg', 'Singapore', false],
  ['th', 'Thailand', false], ['vn', 'Vietnam', false], ['in', 'India', false], ['fr', 'France', false],
  ['de', 'Germany', false], ['br', 'Brazil', false], ['mx', 'Mexico', false],
];
const GAME_GENRES: [number, string][] = [
  [7001, 'Action'], [7002, 'Adventure'], [7003, 'Casual'], [7004, 'Board'], [7005, 'Card'], [7006, 'Casino'],
  [7009, 'Family'], [7011, 'Music'], [7012, 'Puzzle'], [7013, 'Racing'], [7014, 'Role Playing'],
  [7015, 'Simulation'], [7016, 'Sports'], [7017, 'Strategy'], [7018, 'Trivia'], [7019, 'Word'],
];

interface State {
  countries: Json[];
  genres: Json[];
  tracking: Json[];
  rules: Json | null;
  rulesUpdatedAt: string | null;
  rebuild: Json;
  nextTrackingId: number;
}

function initialState(): State {
  return {
    countries: COUNTRIES.map(([code, name, enabled]) => ({ code, name, enabled })),
    genres: [
      { id: 36, name: 'App Store', parentId: null, enabled: false, availableOnApple: true },
      { id: 6014, name: 'Games', parentId: 36, enabled: false, availableOnApple: true },
      ...GAME_GENRES.map(([id, name]) => ({ id, name, parentId: 6014, enabled: [7004, 7005, 7006].includes(id), availableOnApple: true })),
      { id: 7010, name: 'Kids', parentId: 6014, enabled: false, availableOnApple: false },
    ],
    tracking: [7004, 7005, 7006].map((genreId, i) => ({
      id: i + 1, genreId, chartType: 'TOP_FREE', depth: 200, intervalMinutes: 720, allCountries: false, active: true,
      countries: [{ code: 'ph', active: true }],
    })),
    rules: null,
    rulesUpdatedAt: null,
    rebuild: { running: false, startedAt: null, finishedAt: null, chartsDone: 0, chartsTotal: 0, snapshotsProcessed: 0, error: null },
    nextTrackingId: 4,
  };
}

const state = initialState();

// ---------------------------------------------------------------- derived

function targets(): { trackingId: number; country: string; genreId: number; chartType: string }[] {
  return state.tracking.flatMap((t) => {
    const g = state.genres.find((x) => x.id === t.genreId);
    if (!t.active || !g?.enabled || !g.availableOnApple) return [];
    return state.countries
      .filter((c) => c.enabled && (t.allCountries || t.countries.some((tc: Json) => tc.code === c.code && tc.active)))
      .map((c) => ({ trackingId: t.id, country: c.code, genreId: t.genreId, chartType: t.chartType }));
  });
}

const genreName = (id: number) => state.genres.find((g) => g.id === id)?.name ?? String(id);
const countryOut = (c: Json): Json => ({ ...c, activeCharts: targets().filter((t) => t.country === c.code).length });
const trackingOut = (t: Json) => ({ ...t, genreName: genreName(t.genreId), targetCharts: targets().filter((x) => x.trackingId === t.id).length });
const rulesOut = () => ({
  rules: state.rules ?? DEFAULT_RULES, defaults: DEFAULT_RULES, custom: state.rules !== null,
  updatedAt: state.rulesUpdatedAt, tierChoices: TIER_CHOICES,
});
const slug = (type: string) => type.toLowerCase().replace('_', '-');

function status(charts: Json[]) {
  const now = new Date();
  // Recorded charts keep their fixture times; newly targeted ones have no reading yet.
  const known = new Map(charts.map((c) => [c.key, c]));
  const rows = targets().map((t) => {
    const key = `${t.country}/${t.genreId}/${slug(t.chartType)}`;
    const c = known.get(key);
    const interval = state.tracking.find((x) => x.id === t.trackingId)?.intervalMinutes ?? 720;
    return {
      key, country: t.country, countryName: state.countries.find((x) => x.code === t.country)?.name ?? t.country,
      genreId: t.genreId, genreName: genreName(t.genreId), chartType: t.chartType, active: true, intervalMinutes: interval,
      lastAttemptAt: c?.lastAttemptAt ?? null, lastValidReadingAt: c?.lastValidReadingAt ?? null, lastSlot: c?.asOf ?? null,
      lastStatus: c?.asOf ? 'VALID' : c?.lastAttemptAt ? 'FAILED' : null,
      lastReasons: c?.asOf || !c?.lastAttemptAt ? null : 'fetch_error:HTTP 503',
      lastEntryCount: c?.asOf ? 100 : null, delayed: !c?.asOf, pendingSnapshots: 0,
    };
  });
  // Charts no longer targeted stay listed as inactive (their history is kept).
  for (const c of charts) {
    if (!rows.some((r) => r.key === c.key)) {
      rows.push({
        key: c.key, country: c.country, countryName: c.countryName, genreId: c.genreId, genreName: c.genreName,
        chartType: c.chartType, active: false, intervalMinutes: c.intervalMinutes, lastAttemptAt: c.lastAttemptAt,
        lastValidReadingAt: c.lastValidReadingAt, lastSlot: c.asOf, lastStatus: c.asOf ? 'VALID' : null, lastReasons: null,
        lastEntryCount: c.asOf ? 100 : null, delayed: false, pendingSnapshots: 0,
      });
    }
  }
  const times = (k: string) => rows.map((r: Json) => r[k]).filter(Boolean).sort();
  return {
    now: now.toISOString(),
    adminKeyRequired: false,
    collector: { targetCharts: targets().length, lastAttemptAt: times('lastAttemptAt').at(-1) ?? null, lastValidReadingAt: times('lastValidReadingAt').at(-1) ?? null },
    events: { pendingSnapshots: 0, lastProcessedAt: times('lastValidReadingAt').at(-1) ?? null },
    rebuild: state.rebuild,
    charts: rows,
  };
}

// --------------------------------------------------------------- handlers

const ok = (body: unknown, code = 200) => ({ status: code, body });
const problem = (code: number, detail: string, errors?: Record<string, string>) => ({ status: code, body: { status: code, detail, ...(errors ? { errors } : {}) } });
const invalid = (errors: Record<string, string>) => problem(400, `Invalid fields: [${Object.keys(errors).join(', ')}]`, errors);

function validateRules(r: Json): Record<string, string> {
  const e: Record<string, string> = {};
  if (!Array.isArray(r.tiers) || r.tiers.length === 0) e.tiers = 'Pick at least one tier';
  else if (!r.tiers.every((t: number) => TIER_CHOICES.includes(t))) e.tiers = `Tiers must be among ${TIER_CHOICES}`;
  const range = (f: string, min: number, max: number) => {
    if (!Number.isInteger(r[f]) || r[f] < min || r[f] > max) e[f] = `Must be between ${min} and ${max}`;
  };
  range('bigMovePlaces', 2, 50);
  range('risingHours', 2, 168);
  range('risingGainPercent', 1, 100);
  range('risingMinNetPlaces', 1, 200);
  range('newBestAfterDays', 0, 90);
  return e;
}

export function handleManage(path: string, method: string, body: Json, charts: Json[]): { status: number; body: unknown } {
  const p = path.replace(/^\/api\/manage/, '');
  let m: RegExpMatchArray | null;

  if (p === '/countries' && method === 'GET') return ok(state.countries.map(countryOut).sort((a, b) => a.name.localeCompare(b.name)));
  if (p === '/countries' && method === 'POST') {
    const code = String(body.code ?? '').trim().toLowerCase();
    const name = String(body.name ?? '').trim();
    const errors: Record<string, string> = {};
    if (!/^[a-z]{2}$/.test(code)) errors.code = 'Two letters, e.g. ph';
    if (!name || name.length > 80) errors.name = 'Between 1 and 80 characters';
    if (Object.keys(errors).length) return invalid(errors);
    if (state.countries.some((c) => c.code === code)) return problem(409, `Country ${code} already exists`);
    const c = { code, name, enabled: Boolean(body.enabled) };
    state.countries.push(c);
    return ok(countryOut(c), 201);
  }
  if ((m = p.match(/^\/countries\/([a-z]{2})$/)) && method === 'PATCH') {
    const c = state.countries.find((x) => x.code === m![1]);
    if (!c) return problem(404, `No country ${m[1]}`);
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name || name.length > 80) return invalid({ name: 'Between 1 and 80 characters' });
      c.name = name;
    }
    if (body.enabled != null) c.enabled = Boolean(body.enabled);
    return ok(countryOut(c));
  }

  if (p === '/genres' && method === 'GET') return ok([...state.genres].sort((a, b) => a.name.localeCompare(b.name)));
  if ((m = p.match(/^\/genres\/(\d+)$/)) && method === 'PATCH') {
    const g = state.genres.find((x) => x.id === Number(m![1]));
    if (!g) return problem(404, `No genre ${m[1]}`);
    if (body.enabled == null) return invalid({ enabled: 'Required' });
    g.enabled = Boolean(body.enabled);
    return ok(g);
  }

  if (p === '/tracking' && method === 'GET') return ok(state.tracking.map(trackingOut));
  if (p === '/tracking' && method === 'POST') {
    const errors: Record<string, string> = {};
    if (!state.genres.some((g) => g.id === body.genreId)) errors.genreId = `Unknown category ${body.genreId}`;
    if (!CHART_TYPES.includes(body.chartType)) errors.chartType = `One of ${CHART_TYPES}`;
    const depth = body.depth ?? 200;
    const interval = body.intervalMinutes ?? 720;
    if (!(depth >= 1 && depth <= 200)) errors.depth = 'Must be between 1 and 200';
    if (!(interval >= 5 && interval <= 1440)) errors.intervalMinutes = 'Must be between 5 and 1440';
    const countries: string[] = body.countries ?? [];
    const unknown = countries.filter((c) => !state.countries.some((x) => x.code === c));
    if (unknown.length) errors.countries = `Unknown countries ${unknown}`;
    if (Object.keys(errors).length) return invalid(errors);
    if (state.tracking.some((t) => t.genreId === body.genreId && t.chartType === body.chartType)) {
      return problem(409, 'This category and chart type are already tracked');
    }
    const t = {
      id: state.nextTrackingId++, genreId: body.genreId, chartType: body.chartType, depth, intervalMinutes: interval,
      allCountries: Boolean(body.allCountries), active: body.active !== false, countries: countries.map((code) => ({ code, active: true })),
    };
    state.tracking.push(t);
    return ok(trackingOut(t), 201);
  }
  if ((m = p.match(/^\/tracking\/(\d+)$/)) && method === 'PATCH') {
    const t = state.tracking.find((x) => x.id === Number(m![1]));
    if (!t) return problem(404, `No tracking ${m[1]}`);
    const errors: Record<string, string> = {};
    if (body.depth != null && !(body.depth >= 1 && body.depth <= 200)) errors.depth = 'Must be between 1 and 200';
    if (body.intervalMinutes != null && !(body.intervalMinutes >= 5 && body.intervalMinutes <= 1440)) errors.intervalMinutes = 'Must be between 5 and 1440';
    if (Object.keys(errors).length) return invalid(errors);
    for (const k of ['depth', 'intervalMinutes', 'allCountries', 'active']) if (body[k] != null) t[k] = body[k];
    return ok(trackingOut(t));
  }
  if ((m = p.match(/^\/tracking\/(\d+)\/countries\/([a-z]{2})$/)) && method === 'PUT') {
    const t = state.tracking.find((x) => x.id === Number(m![1]));
    if (!t) return problem(404, `No tracking ${m[1]}`);
    if (!state.countries.some((c) => c.code === m![2])) return problem(404, `No country ${m[2]}`);
    if (body.active == null) return invalid({ active: 'Required' });
    const tc = t.countries.find((c: Json) => c.code === m![2]);
    if (tc) tc.active = Boolean(body.active);
    else t.countries.push({ code: m[2], active: Boolean(body.active) });
    return ok(trackingOut(t));
  }

  if ((m = p.match(/^\/categories\/(\d+)$/)) && method === 'PUT') {
    const genreId = Number(m[1]);
    const g = state.genres.find((x) => x.id === genreId);
    if (!g) return problem(404, `No category ${genreId}`);
    const rows = state.tracking.filter((t) => t.genreId === genreId);
    const errors: Record<string, string> = {};
    const types: string[] | undefined = body.chartTypes;
    if (types && !types.every((t) => CHART_TYPES.includes(t))) errors.chartTypes = `Among ${CHART_TYPES}`;
    if (rows.length === 0 && !types?.length) errors.chartTypes = 'Pick at least one chart';
    if (rows.length === 0 && !g.availableOnApple) errors.genreId = 'Apple no longer lists this category';
    const depth = body.depth ?? rows[0]?.depth ?? 200;
    const interval = body.intervalMinutes ?? rows[0]?.intervalMinutes ?? 720;
    if (!(depth >= 1 && depth <= 200)) errors.depth = 'Must be between 1 and 200';
    if (!(interval >= 5 && interval <= 1440)) errors.intervalMinutes = 'Must be between 5 and 1440';
    const unknown = (body.countries ?? []).filter((c: string) => !state.countries.some((x) => x.code === c));
    if (unknown.length) errors.countries = `Unknown countries ${unknown}`;
    if (Object.keys(errors).length) return invalid(errors);

    if (body.enabled != null) g.enabled = Boolean(body.enabled);
    const countries: string[] = body.countries
      ?? [...new Set(rows.flatMap((r) => r.countries.filter((c: Json) => c.active).map((c: Json) => c.code)))];
    for (const t of rows) {
      for (const k of ['depth', 'intervalMinutes', 'allCountries']) if (body[k] != null) t[k] = body[k];
      if (body.countries) {
        for (const tc of t.countries) tc.active = countries.includes(tc.code);
        for (const code of countries) if (!t.countries.some((tc: Json) => tc.code === code)) t.countries.push({ code, active: true });
      }
    }
    if (types) {
      for (const type of CHART_TYPES) {
        const row = rows.find((r) => r.chartType === type);
        if (row) row.active = types.includes(type);
        else if (types.includes(type)) {
          state.tracking.push({
            id: state.nextTrackingId++, genreId, chartType: type, depth, intervalMinutes: interval,
            allCountries: body.allCountries ?? rows[0]?.allCountries ?? false, active: true,
            countries: countries.map((code) => ({ code, active: true })),
          });
        }
      }
    }
    return ok(state.tracking.filter((t) => t.genreId === genreId).map(trackingOut));
  }

  if (p === '/rules' && method === 'GET') return ok(rulesOut());
  if (p === '/rules' && method === 'PUT') {
    const errors = validateRules(body);
    if (Object.keys(errors).length) return invalid(errors);
    state.rules = { ...DEFAULT_RULES, ...body };
    state.rulesUpdatedAt = new Date().toISOString();
    return ok(rulesOut());
  }
  if (p === '/rules' && method === 'DELETE') {
    state.rules = null;
    state.rulesUpdatedAt = null;
    return ok(rulesOut());
  }

  if (p === '/status' && method === 'GET') return ok(status(charts));
  if (p === '/actions/process-events' && method === 'POST') return ok({ processedSnapshots: 0 });
  if (p === '/actions/refresh-metadata' && method === 'POST') return ok({ apps: 42, found: 41, notFound: 1, failedCalls: 0 });
  if (p === '/actions/rebuild-events' && method === 'POST') {
    if (state.rebuild.running) return problem(409, 'Events are already being recomputed');
    const total = charts.filter((c) => c.asOf).length;
    state.rebuild = { running: true, startedAt: new Date().toISOString(), finishedAt: null, chartsDone: 0, chartsTotal: total, snapshotsProcessed: 0, error: null };
    // One chart every 2 seconds, so the progress bar is visible.
    const step = () => {
      if (state.rebuild.chartsDone >= total) {
        state.rebuild = { ...state.rebuild, running: false, finishedAt: new Date().toISOString() };
        return;
      }
      state.rebuild = { ...state.rebuild, chartsDone: state.rebuild.chartsDone + 1, snapshotsProcessed: state.rebuild.snapshotsProcessed + 240 };
      setTimeout(step, 2000);
    };
    setTimeout(step, 2000);
    return ok(state.rebuild, 202);
  }

  return problem(404, `Unknown endpoint ${method} ${path}`);
}
