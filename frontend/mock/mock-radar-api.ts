// Development-only fake of the Radar API (/api/radar), kept in memory: theme and
// dismissal changes last until the dev server restarts. Same shapes, limits and
// status codes as the backend (400 with {"errors": {...}}, 404, 409), no admin key.
// The Radar itself is a plausible hand-made reading of the recorded PH Casino
// fixtures: every section is filled except "abroad" (the fixtures have one country).
type Json = Record<string, any>;
type Load = (path: string) => Json | null;

const POINTS: Record<string, number> = {
  NEW_APP: 2, NEW_IN_CHARTS: 2, CLIMBING: 2, STEADY: 1, RATINGS_GROWING: 2, RATINGS_FAST: 1,
  UNKNOWN_THEME: 2, HAS_FOLLOWERS: 3, MULTI_COUNTRY: 1, NEW_DEVELOPER: 1,
};
const WINDOWS: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30 };
const CASINO = 'ph/7006/top-free';
const DAY = 86_400_000;

const SEED: [string, string[]][] = [
  ['Tongits', ['tongits']], ['Pusoy', ['pusoy', 'pusoy dos']], ['Slots', ['slot', 'slots']], ['Bingo', ['bingo']],
  ['Poker', ['poker', 'texas', 'holdem']], ['Mahjong', ['mahjong']], ['Sabong', ['sabong']], ['Ludo', ['ludo']],
  ['Domino', ['domino', 'dominoes']], ['Chess', ['chess']], ['Solitaire', ['solitaire']], ['Lucky 9', ['lucky 9', 'lucky nine']],
  ['Sakla', ['sakla']], ['Color game', ['color game', 'perya']],
];
const created = new Date().toISOString();
let nextThemeId = 1;
const themes: Json[] = SEED.map(([name, keywords]) => ({ id: nextThemeId++, name, keywords, active: true, createdAt: created, updatedAt: created }));
const dismissed = new Set<string>();

// --------------------------------------------------------------- the reading

interface AppSpec {
  id: string;
  reasons: string[];
  startRank?: number;
  placesGained?: number;
  ageDays?: number;
  ratings?: [gained: number, percent: number | null];
  firstSeenDaysAgo?: number;
}

const NEWCOMERS: AppSpec[] = [
  { id: '900000028', reasons: ['HAS_FOLLOWERS', 'NEW_IN_CHARTS', 'NEW_APP', 'CLIMBING', 'RATINGS_GROWING'], placesGained: 41, ageDays: 23, ratings: [212, 64.2], firstSeenDaysAgo: 12 },
  { id: '900000009', reasons: ['NEW_IN_CHARTS', 'CLIMBING', 'UNKNOWN_THEME', 'STEADY'], placesGained: 18, ageDays: 140, ratings: [35, 12.5], firstSeenDaysAgo: 9 },
  { id: '900000014', reasons: ['NEW_APP', 'UNKNOWN_THEME', 'RATINGS_GROWING', 'RATINGS_FAST'], placesGained: 6, ageDays: 41, ratings: [480, 88.9], firstSeenDaysAgo: 30 },
  { id: '900000016', reasons: ['NEW_APP', 'NEW_IN_CHARTS', 'UNKNOWN_THEME'], placesGained: 22, ageDays: 11, firstSeenDaysAgo: 6 },
  { id: '900000027', reasons: ['NEW_IN_CHARTS', 'UNKNOWN_THEME'], placesGained: 3, ageDays: 320, ratings: [4, 1.1], firstSeenDaysAgo: 4 },
  { id: '900000013', reasons: ['NEW_APP', 'STEADY'], placesGained: 2, ageDays: 64, firstSeenDaysAgo: 40 },
  { id: '900000030', reasons: ['NEW_APP'], placesGained: -4, ageDays: 77, firstSeenDaysAgo: 35 },
];

const RISING: AppSpec[] = [
  { id: '900000017', reasons: ['CLIMBING', 'UNKNOWN_THEME', 'STEADY'], startRank: 71, ageDays: 410, ratings: [26, 9.8], firstSeenDaysAgo: 60 },
  { id: '900000022', reasons: ['CLIMBING', 'RATINGS_GROWING', 'STEADY'], startRank: 88, ageDays: 205, ratings: [150, 41.3], firstSeenDaysAgo: 45 },
  { id: '900000029', reasons: ['CLIMBING', 'STEADY'], startRank: 64, ageDays: 530, firstSeenDaysAgo: 80 },
];

const WORDS = [
  { word: 'fortune', apps: ['900000028', '900000009', '900000016'], developers: 2, daysAgo: 12 },
  { word: 'slot', apps: ['900000028', '900000020', '900000012', '900000029', '900000018', '900000006'], developers: 3, daysAgo: 13 },
];

const CLUSTER = { originator: '900000028', followers: ['900000009', '900000016'], word: 'fortune', daysAgo: 12 };

// ------------------------------------------------------------------ handler

const invalid = (errors: Json) => ({ status: 400, body: { status: 400, detail: `Invalid fields: [${Object.keys(errors).join(', ')}]`, errors } });
const notFound = (detail: string) => ({ status: 404, body: { status: 404, detail } });

export function handleRadar(p: string, method: string, body: Json, qs: URLSearchParams, load: Load): { status: number; body: unknown } {
  const index = (load('search-index.json') ?? []) as unknown as Json[];

  if (p === '/api/radar' && method === 'GET') return radar(qs, index, load);
  if (p === '/api/radar/themes' && method === 'GET') return { status: 200, body: themes };

  if (p === '/api/radar/themes' && method === 'POST') {
    const errors: Json = {};
    const name = cleanName(body.name, true, errors);
    const keywords = cleanKeywords(body.keywords, true, errors);
    if (Object.keys(errors).length) return invalid(errors);
    if (themes.some((th) => th.name.toLowerCase() === name!.toLowerCase())) return conflict(name!);
    const now = new Date().toISOString();
    const theme = { id: nextThemeId++, name, keywords, active: body.active !== false, createdAt: now, updatedAt: now };
    themes.push(theme);
    return { status: 200, body: theme };
  }

  const m = p.match(/^\/api\/radar\/themes\/(\d+)$/);
  if (m && method === 'PUT') {
    const theme = themes.find((th) => th.id === Number(m[1]));
    if (!theme) return notFound(`No theme ${m[1]}`);
    const errors: Json = {};
    const name = cleanName(body.name, false, errors);
    const keywords = cleanKeywords(body.keywords, false, errors);
    if (Object.keys(errors).length) return invalid(errors);
    if (name && themes.some((th) => th.id !== theme.id && th.name.toLowerCase() === name.toLowerCase())) return conflict(name);
    if (name) theme.name = name;
    if (keywords) theme.keywords = keywords;
    if (typeof body.active === 'boolean') theme.active = body.active;
    theme.updatedAt = new Date().toISOString();
    return { status: 200, body: theme };
  }

  if (p === '/api/radar/dismiss' && method === 'POST') {
    if (!body.appleAppId) return invalid({ appleAppId: 'Required' });
    if (!index.some((r) => r.app.appleAppId === body.appleAppId)) return notFound(`No app ${body.appleAppId}`);
    const active = body.active !== false;
    if (active) dismissed.add(body.appleAppId);
    else dismissed.delete(body.appleAppId);
    return { status: 200, body: { appleAppId: body.appleAppId, active } };
  }

  return notFound(`Unknown endpoint ${method} ${p}`);
}

const conflict = (name: string) => ({ status: 409, body: { status: 409, detail: `A theme named "${name}" already exists` } });

function cleanName(raw: unknown, required: boolean, errors: Json): string | null {
  if (raw == null) {
    if (required) errors.name = 'Required';
    return null;
  }
  const name = String(raw).trim().replace(/\s+/g, ' ');
  if (!name) errors.name = 'Required';
  else if (name.length > 60) errors.name = 'At most 60 characters';
  return name;
}

function cleanKeywords(raw: unknown, required: boolean, errors: Json): string[] | null {
  if (raw == null) {
    if (required) errors.keywords = 'Add at least one keyword';
    return null;
  }
  const out = [...new Set((raw as unknown[]).map((k) => String(k ?? '').trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean))];
  if (out.some((k) => k.length > 40 || !/[\p{L}\p{N}]/u.test(k))) errors.keywords = 'Each keyword needs a letter or digit and at most 40 characters';
  else if (!out.length) errors.keywords = 'Add at least one keyword';
  else if (out.length > 20) errors.keywords = 'At most 20 keywords';
  return out;
}

/** The words of the active themes, with the backend's simple "s" stemming. */
function themeWords(): Set<string> {
  const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  return new Set(themes.filter((th) => th.active).flatMap((th) => th.keywords.flatMap((k: string) => k.split(' ').map(stem))));
}

function radar(qs: URLSearchParams, index: Json[], load: Load): { status: number; body: unknown } {
  const country = (qs.get('country') ?? 'ph').toLowerCase();
  const window = qs.get('window') ?? '14d';
  const genre = qs.get('genre') ? Number(qs.get('genre')) : null;
  const hideKnown = qs.get('hideKnown') !== 'false';
  const showDismissed = qs.get('showDismissed') === 'true';
  const minScore = Number(qs.get('minScore') ?? 4);
  if (!(window in WINDOWS)) return invalid({ window: 'Must be one of [7d, 14d, 30d]' });

  const charts = ((load('charts.json') ?? []) as unknown as Json[]).filter((c) => c.country === country && c.active !== false
    && (genre === null || c.genreId === genre));
  const empty = { newcomers: [], risingFromBottom: [], emergingWords: [], clusters: [], abroad: [], abroadWords: [] };
  if (charts.length === 0) {
    return { status: 200, body: { country, genreId: genre, window, asOf: null, dataSince: null, hideKnown, minScore, hiddenByScore: 0, ...empty, notes: ['ONLY_ONE_COUNTRY', 'NO_CHARTS'] } };
  }

  const rows = ((load(`chart/${CASINO}/ranking.30d.json`)?.rows ?? []) as Json[]);
  const allPoints = rows.flatMap((r) => r.trend as Json[]);
  const latest = Math.max(...allPoints.map((pt) => Date.parse(pt.t)));
  const from = latest - WINDOWS[window]! * DAY;
  const dataSince = new Date(Math.min(...allPoints.map((pt) => Date.parse(pt.t)))).toISOString();
  const card = (id: string) => index.find((r) => r.app.appleAppId === id)?.app ?? null;
  const rankOf = (id: string) => rows.find((r) => r.app.appleAppId === id)?.rank
    ?? index.find((r) => r.app.appleAppId === id)?.charts?.[0]?.rank ?? null;
  const trendOf = (id: string) => ((rows.find((r) => r.app.appleAppId === id)?.trend ?? []) as Json[])
    .filter((pt) => Date.parse(pt.t) >= from);
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const casinoInScope = charts.some((c) => c.key === CASINO);

  let hiddenByScore = 0;
  const appRows = (specs: AppSpec[]) => (casinoInScope ? specs : []).flatMap((s) => {
    const isDismissed = dismissed.has(s.id);
    if (isDismissed && !showDismissed) return [];
    const reasons = s.reasons;
    const score = reasons.reduce((sum, r) => sum + (POINTS[r] ?? 0), 0);
    if (score < minScore) {
      hiddenByScore++;
      return [];
    }
    const currentRank = rankOf(s.id);
    return [{
      app: card(s.id), chart: CASINO, currentRank, startRank: s.startRank ?? null,
      placesGained: s.startRank != null && currentRank != null ? s.startRank - currentRank : s.placesGained ?? null,
      ratingsGained: s.ratings?.[0] ?? null, ratingsGrowthPercent: s.ratings?.[1] ?? null, ageDays: s.ageDays ?? null,
      firstSeenAt: s.firstSeenDaysAgo != null ? ago(s.firstSeenDaysAgo) : null, reasons, score, dismissed: isDismissed,
      trend: trendOf(s.id),
    }];
  });

  const known = themeWords();
  const words = (casinoInScope ? WORDS : []).filter((w) => !hideKnown || !known.has(w.word)).map((w) => ({
    word: w.word, appCount: w.apps.length, developerCount: w.developers, firstSeenAt: ago(w.daysAgo), apps: w.apps.map(card).filter(Boolean),
  }));

  const showCluster = casinoInScope && !(hideKnown && known.has(CLUSTER.word))
    && (showDismissed || !dismissed.has(CLUSTER.originator));
  const clusterIds = [CLUSTER.originator, ...CLUSTER.followers];
  const clusters = showCluster ? [{
    originator: card(CLUSTER.originator), chart: CASINO, originatorFirstSeenAt: ago(CLUSTER.daysAgo), trend: trendOf(CLUSTER.originator),
    followers: CLUSTER.followers.map(card).filter(Boolean), word: CLUSTER.word,
    placesGained: clusterIds.reduce((sum, id) => sum + Math.max(0, NEWCOMERS.find((s) => s.id === id)?.placesGained ?? 0), 0),
    ratingsGained: clusterIds.reduce((sum, id) => sum + (NEWCOMERS.find((s) => s.id === id)?.ratings?.[0] ?? 0), 0),
    countries: 1, dismissed: dismissed.has(CLUSTER.originator),
  }] : [];

  return {
    status: 200,
    body: {
      country, genreId: genre, window, asOf: new Date(latest).toISOString(), dataSince, hideKnown, minScore,
      newcomers: appRows(NEWCOMERS), risingFromBottom: appRows(RISING), hiddenByScore, emergingWords: words, clusters,
      abroad: [], abroadWords: [], notes: ['ONLY_ONE_COUNTRY'],
    },
  };
}
