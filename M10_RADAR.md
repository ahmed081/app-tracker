# Milestone 10: Radar (spotting new niches)

The owner requested this on 2026-10-23. Read `CLAUDE.md` first.

**Keep everything else as it is.** Do not change existing screens, rules, the collector or Milestone 9's scope. The Radar is an **addition**: one new page, one small migration, and one new read-only backend package.

## 1. Goal

A new niche has no name, no group of similar apps, often no category of its own, and no history. The Radar finds **things that don't fit yet** in data the tracker already collects:

| Data | Where it is |
|---|---|
| Ranks | `ranking`, `snapshot` |
| When the tracker first saw an app | `app.first_seen_at` |
| Release date | `app.release_date` |
| Names and descriptions | `app_listing_version` (name, summary), `app_metadata_version` (description) |
| Developers | `developer` |
| Daily rating counts | `app_rating_daily` |
| Several countries and categories | `chart` |

It shows **why** each item is flagged (reason chips), not just a score.

No new external data source: no Google Trends, no social media, no Apple search API in v1.

## 2. The Radar page (`/radar`, new menu item "Radar")

### Top bar (reuse existing components)
- **Country:** default `ph`.
- **Scope:** all tracked categories in that country (default), or one category.
- **Period:** 7D / 14D (default) / 30D.
- **Toggle:** "Hide known themes" (on by default).

### Five sections, each a `Panel`

**1. Newcomers.** Apps that are new **and** gaining.
- **Who appears:**
  - first seen by the tracker within the period, **or** released by Apple within the last 90 days;
  - currently ranked in at least one active chart of the scope.
- **Each row shows:**
  - app (icon, name, developer), best current rank and chart;
  - rank change over the period;
  - rating-count growth over 7 days (absolute and %);
  - age in days;
  - reason chips.
- **Sorting:** by radar score (see §3).

**2. Rising from the bottom.**
- Apps that were in the **bottom half** of a chart's depth (e.g. ranks 51–100 for depth 100) at the start of the period and are now in the **top half**.
- It must also rise in **at least 60% of readings** over the period (steady, not one jump). This mirrors the rising rule.
- These are often new kinds of apps before anyone notices.

**3. Emerging words.** New vocabulary.
- **The words:** taken from the name and the summary/subtitle of apps **first seen within the period**, compared with apps first seen in the 60 days before.
- **A word is flagged when all of these hold:**
  - it appears in **≥ 3 new apps** from **≥ 2 different developers**;
  - it appeared in **≤ 1 app** in the baseline;
  - it is not a stop word and not part of a known theme (when "Hide known themes" is on).
- **Each word row shows:**
  - the word;
  - the number of new apps and developers;
  - its first appearance;
  - the apps, as small icons linking to their pages.
- **Action:** "Save as theme" (see §4).

**4. Possible new niches.** Clusters.
- **What a cluster is:**
  - one **originator**: the app with that word, or a similar name, that was seen first;
  - its **followers**: other apps from **other developers**, first seen after the originator, within the period plus 30 days.
- **Similar name:** shares a rare word (an emerging word, or a word used by ≤ 2 apps overall), or the normalised names are close (Jaro-Winkler ≥ 0.9 after removing stop words).
- **When a cluster shows:** only with **at least 2 followers**. The rule of thumb is "one app is a hit; the copies make the niche".
- **Each cluster card shows:**
  - the originator and its rank history as a sparkline;
  - the followers;
  - the total rank gained;
  - the combined rating growth;
  - the number of countries it ranks in.

**5. Seen abroad, not here yet.**
- **Who appears:** apps (and emerging words) ranked in the **Top 25** of a tracked chart in **another enabled country**, in a category also tracked in the selected country, that have **never ranked** in the selected country.
- **Each row shows:** the app, where it ranks and since when, and the countries it ranks in.
- **When only one country is enabled:** show an empty state that explains how to enable more (link to Settings → Countries) and mentions `collector/db/activate-us.sql`.

### On every app row
- A link to the app page.
- A **Dismiss** button (hide from the Radar; reversible from "Show dismissed").
- If Milestone 9 is built, the existing `FollowButton`. Don't build follow logic here.

### States
- **Loading:** skeletons.
- **Empty, per section:** explain what would make the section fill up, e.g. "Not enough history yet: the Radar needs about 2 weeks of collection".
- **Errors:** the existing `ErrorState`.

## 3. Radar score and reasons (pure functions, unit tested)

Each candidate app gets **reasons**, and a score that is simply the sum of their points. Points are constants in one place, so they are easy to tune later.

| Reason (chip) | Condition | Points |
|---|---|---|
| `NEW_APP` | released ≤ 90 days ago | 2 |
| `NEW_IN_CHARTS` | first seen by the tracker within the period | 2 |
| `CLIMBING` | gained ≥ 10 places over the period (or bottom → top half) | 2 |
| `STEADY` | rose in ≥ 60% of readings | 1 |
| `RATINGS_GROWING` | rating count +≥ 30% over 7 days and +≥ 20 ratings | 2 |
| `RATINGS_FAST` | rating growth in the top 10% of ranked apps in the scope | 1 |
| `UNKNOWN_THEME` | name/summary matches no known theme | 2 |
| `HAS_FOLLOWERS` | is the originator of a cluster with ≥ 2 followers | 3 |
| `MULTI_COUNTRY` | ranks in ≥ 2 enabled countries | 1 |
| `NEW_DEVELOPER` | developer's first app seen by the tracker | 1 |

**Rules:**
- Hide apps with score < 4 by default; a "Show all" link reveals them.
- **Ignore readings flagged as gaps** (after outages), and only use VALID snapshots.
- **Ratings growth** needs at least 2 daily rows. Without them, the reason simply doesn't apply (no error).

## 4. Themes (known niches)

"Unknown theme" needs a list of known themes.

- **The list:** themes are a name plus keywords, managed in a **Themes** tab on the Radar page itself. **Do not add it to Settings.**
- **Seed themes:**
  - Tongits (`tongits`)
  - Pusoy (`pusoy`, `pusoy dos`)
  - Slots (`slot`, `slots`)
  - Bingo (`bingo`)
  - Poker (`poker`, `texas`, `holdem`)
  - Mahjong (`mahjong`)
  - Sabong (`sabong`)
  - Ludo (`ludo`)
  - Domino (`domino`, `dominoes`)
  - Chess (`chess`)
  - Solitaire (`solitaire`)
  - Lucky 9 (`lucky 9`, `lucky nine`)
  - Sakla (`sakla`)
  - Color game (`color game`, `perya`)
- **"Save as theme"** from an emerging word creates a theme with that word. The word then disappears from "Emerging words" when "Hide known themes" is on.
- **Themes are switched off, never deleted.**

### Words and stop words (`domain`-style pure helper, unit tested)
- **Lowercase**, remove accents, split on anything that isn't a letter or digit. Use a Unicode-aware split, because names can be Filipino, English, Arabic or other scripts.
- **Drop:** words of 2 characters or fewer, pure numbers and years.
- **Stop words:** English and Filipino/Tagalog, plus generic app words: `game`, `games`, `online`, `offline`, `free`, `pro`, `plus`, `app`, `new`, `best`, `real`, `classic`, `card`, `casino`, `ng`, `sa`, `ang`, `mga`, `laro`…
  - Keep the list in one file.
  - Category names are stop words too: a word that is just the category isn't news.
- **Plurals:** treat `slot`/`slots` as one word with simple `s` stemming. Nothing more clever.

## 5. Technical design

### Migration `V5__radar.sql` (or the next free number after Milestone 9)
```
radar_theme
  id          bigint identity PK
  name        text NOT NULL UNIQUE
  keywords    text[] NOT NULL
  active      boolean NOT NULL DEFAULT true
  created_at, updated_at timestamptz

radar_dismissal
  app_id      bigint PK REFERENCES app(id)
  active      boolean NOT NULL DEFAULT true   -- "undismiss" sets false
  created_at, updated_at timestamptz
```
- **Seed** the themes from §4.
- **Grants:** `app_backend` gets `SELECT, INSERT, UPDATE` on both tables and the sequence. **No `DELETE`.**

### Backend (package `com.apptracker.radar`, read-mostly)
- **`RadarRepository`:** NamedParameterJdbcTemplate.
  - Candidates: apps ranked in the scope's active charts within the period, with their first/last ranks, reading counts, `release_date`, `first_seen_at`, developer, latest name/summary, and rating counts at the start and end (`app_rating_daily`).
  - Keep it to a few set-based queries, not one per app.
- **Pure helpers, unit tested:**
  - `Words` (tokenise, stop words, stemming);
  - `RadarScorer` (reasons and score);
  - `EmergingWords`;
  - `Clusters` (originator, followers, Jaro-Winkler);
  - `AbroadNotHere`.
- **`RadarService`:**
  - Computes the whole Radar for (country, scope, period) **at read time**, like M9's alerts.
  - Caches the result for 10 minutes per parameter set (a simple in-memory map with timestamps is enough).
  - The data changes hourly, and the volume is small: hundreds of apps.
- **`RadarController`:**

| Endpoint | Returns / does |
|---|---|
| `GET /api/radar?country=ph&genre=&window=14d&hideKnown=true&showDismissed=false&minScore=4` | `{newcomers[], risingFromBottom[], emergingWords[], clusters[], abroad[], dataSince, notes[]}`. Rows reuse the existing `AppCard`; each row has `reasons[]`, `score`, and the numbers shown in §2 |
| `GET /api/radar/themes` · `POST` · `PUT /api/radar/themes/{id}` | Themes: list, create `{name, keywords}`, change `{name?, keywords?, active?}` |
| `POST /api/radar/dismiss` `{appleAppId, active}` | Dismiss / undismiss |

- **Validation:** 400 with field errors, as in `/api/manage`.
- **Protection:** like Settings. Add `/api/radar/**` to the admin-key interceptor for **non-GET methods only**; `GET` stays open.
- **`dataSince`:** the first VALID snapshot in the scope. The frontend uses it to say "not enough history yet" when it is less than 7 days ago.

### Frontend
- **API layer:** `api/radarApi.ts` + `api/radarTypes.ts`. Reads are merged into `trackerApi`; writes go through the existing `useMutation`/`manageSaga` mechanism, with `INVALIDATES` entries. Only `src/api/*` knows URLs.
- **Domain:** `domain/radar.ts` holds the reason-chip definitions (label key, tone, order), the "not enough history" rule and the sorting. Unit-test it.
- **Components:**
  - `ReasonChips`;
  - `RadarAppRow` (reuses `AppLabel`, `Sparkline`, `RankDelta`);
  - `WordRow`;
  - `ClusterCard`;
  - `ThemeEditor`, for the Themes tab: list with switches, add a theme, edit keywords as chips.
- **Page:** `pages/RadarPage.tsx`, a lazy route; it has two tabs, Radar and Themes.
- **i18n:**
  - Every text in `en.json` **and** `ar.json`, with full Arabic plurals: "N new apps", "N developers", "N followers", "N countries", ages in days.
  - Words and app names keep `dir="auto"`.
- **Fake API:** extend `mock/` with a plausible `/api/radar` response built from the existing fixtures, plus an in-memory fake of themes and dismissals, so `npm run dev:mock` shows every section filled. Include at least one cluster, one emerging word, and the "abroad" empty state.

### Tests (owner's rule: light, unit tests and migration tests only)
- **Backend:**
  - `WordsTest`: tokenising, stop words, `s` stemming, non-Latin names.
  - `RadarScorerTest`: each reason, thresholds, missing ratings.
  - `EmergingWordsTest`: ≥ 3 apps / ≥ 2 developers / baseline ≤ 1, and the known-theme filter.
  - `ClustersTest`: originator order, followers from other developers only, the minimum of 2 followers.
- **Migration test** for V5: tables, seed themes, and the backend role can insert and update but **not delete**.
- **Frontend:** `domain/radar.test.ts`; the i18n key test must still pass.

## 6. Build order (stop for review after each)

1. **Backend + migration:** helpers and tests first, then the repository, service and endpoints. Check the endpoint against the QA or real database: numbers make sense, response time under 1 s.
2. **Frontend:** the Radar tab (five sections), the Themes tab, the fake API, both languages.

When done, update the READMEs (endpoint tables, screens) and `CLAUDE.md` (sections 5, 7 and 10).

## 7. Out of scope for v1

Do not build these; they are noted here for later:
- external signals (Google Trends, social, ad libraries);
- Apple keyword search to measure supply;
- review-text analysis;
- radar alerts (they could plug into M9's alert rules later).
