# Rankline: web app

The dashboard and app pages of the App Store ranking tracker. It reads only from the backend API and is deployed on its own.

**Stack:** React 19 · TypeScript · Vite · Redux Toolkit + Redux Saga · React Router · i18next (English, Arabic) · Tailwind CSS · Recharts.

## Screens

| Route | Screen |
|---|---|
| `/` | Overview of the selected chart: since your last visit, #1, biggest climber and drop, new in the Top 10, latest important moves, rising apps |
| `/charts/ph/7006/top-free` | Current ranking: Top 25 (or 100) with change since the previous reading and over the period, badges, 7-day trend, rating; noise filter; "over time" bump chart; apps that just left |
| `/charts/ph/7006/top-free/movers` | Climbers, fallers, new entries, left the chart, rising, tier changes |
| `/apps/{appleAppId}?chart=…&range=7d` | App details: identity and context, current rank, ranking history graph, key changes, time at the top, ratings, versions, about |
| `/search?q=…` | Apps by name, developer, Apple ID or bundle ID |

The chart, the period (1H / 24H / 7D / 30D), the noise filter, the language and the theme are remembered in the browser.

## Develop

```bash
npm install
npm run dev:mock     # http://localhost:5173 with a fake API (mock/fixtures): no backend needed
npm run dev          # http://localhost:5173, /api proxied to http://localhost:8080 (API_PROXY_TARGET to change)
npm test             # unit tests
npm run build        # type-check and build to dist/
```

The fake API serves recorded responses in exactly the backend's shapes (10 days of simulated hourly data for Casino Top Free, Philippines).

## Deploy

The image serves the built app with Nginx. The API address is set when the container starts, so the same image works with any backend.

```bash
docker build -t rankline-web .

# Option 1: Nginx forwards /api to the backend (same origin, no CORS setup)
docker run -p 3000:80 -e API_UPSTREAM=http://backend-host:8080 rankline-web

# Option 2: the browser calls the backend directly
docker run -p 3000:80 -e API_BASE_URL=https://api.example.com rankline-web
#   then allow this site in the backend: CORS_ORIGINS=https://your-site.example.com
```

`docker-compose.yml` in this folder does the same; the root `docker-compose.yml` runs it next to the backend (option 1).

Static hosting (S3, Netlify, any web server) also works: upload `dist/`, edit `dist/config.js` to set `apiBaseUrl`, and serve `index.html` for unknown paths.

## Structure

```
src/
├── api/            the only code that knows backend URLs: types (mirror of the API), fetch client, one function per endpoint
├── app/            store (Redux Toolkit + saga middleware), typed hooks, routes
├── config/         runtime configuration (config.js)
├── domain/         pure rules: rank changes, tiers, chart keys, history summaries, which events matter (unit tested)
├── features/
│   ├── remote/       one cache for every API resource: slice + saga (fetching, de-duplication,
│   │                 refresh every 5 min and when the tab comes back) + useResource() hook
│   ├── preferences/  language, theme, chart, period, noise filter, last visit; saga applies and saves them
│   └── charts/       which chart is selected (URL → remembered → first with data)
├── i18n/           i18next setup, en/ar translations, locale-aware formatting
├── components/
│   ├── ui/           generic pieces: Panel, SegmentedControl, Select, RankDelta, RankTransition, badges, states
│   ├── app/          domain pieces: AppLabel, EventList, MoverList, Freshness
│   ├── charts/       RankHistoryChart, BumpChart, Sparkline
│   └── layout/       AppShell, ChartToolbar
└── pages/          one file per screen, composing the pieces above
```

**Data flow:** a page calls `useResource('ranking', params)` → the hook dispatches `fetchRequested` → the remote saga calls `trackerApi.ranking(params)` unless a fresh copy is cached → the slice stores the result → the page re-renders. Adding an endpoint means adding one function to `api/trackerApi.ts`; it is then available to every page with full typing.

## Languages

- **Both from the start:** every visible text comes from `src/i18n/locales/en.json` and `ar.json`.
- **Completeness:** a test checks that both files have the same keys, that Arabic has all six plural forms, and that every key used in the code exists.
- **Right-to-left:** Arabic switches the page to right-to-left. Layout uses logical properties (start/end), so it mirrors automatically.
- **Charts stay left-to-right:** time still runs left to right in Arabic, the usual convention for data.
- **Numbers:** Arabic uses Western digits, so ranks read the same and line up in tables. Dates, relative times and country names come from the browser's built-in formatting in each language.
- **Adding a language:** add a locale file, add it to `i18n/index.ts`, and add a switch option.

## The App page's ranking graph

It is designed to be read in a few seconds:

- **The line:** one line in one colour, with #1 at the top.
- **The axis:** zoomed on the app's actual range; an app moving between #2 and #8 isn't flattened against a 1–100 scale.
- **Guides:** only Top 10 and Top 25.
- **Markers:** at most 8, for the moves that change the story (reached #1, entered or left the Top 10/5, entered or left the chart). Green means up, red means down.
- **Releases:** shown as faint vertical lines labelled with the version.
- **Breaks in the line:** mean there is no ranking for that period.
- **Summary:** a sentence above the graph states the trend ("Climbed from #82 to #2 over the last 7 days").
- **Table view:** the data is also available as a table, for screen readers.
