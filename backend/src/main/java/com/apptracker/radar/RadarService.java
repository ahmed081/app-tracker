package com.apptracker.radar;

import com.apptracker.api.ApiModel.AppCard;
import com.apptracker.api.ApiModel.Point;
import com.apptracker.api.NotFoundException;
import com.apptracker.api.QueryRepository;
import com.apptracker.api.TimeWindow;
import com.apptracker.config.AppProperties;
import com.apptracker.manage.ConflictException;
import com.apptracker.manage.ValidationException;
import com.apptracker.radar.AbroadNotHere.ChartRank;
import com.apptracker.radar.Clusters.Cluster;
import com.apptracker.radar.Clusters.Member;
import com.apptracker.radar.EmergingWords.AppWords;
import com.apptracker.radar.EmergingWords.Word;
import com.apptracker.radar.RadarModel.AbroadRank;
import com.apptracker.radar.RadarModel.DismissRequest;
import com.apptracker.radar.RadarModel.Dismissal;
import com.apptracker.radar.RadarModel.RadarAbroad;
import com.apptracker.radar.RadarModel.RadarApp;
import com.apptracker.radar.RadarModel.RadarCluster;
import com.apptracker.radar.RadarModel.RadarResponse;
import com.apptracker.radar.RadarModel.RadarWord;
import com.apptracker.radar.RadarModel.Theme;
import com.apptracker.radar.RadarModel.ThemeRequest;
import com.apptracker.radar.RadarRepository.AppInfo;
import com.apptracker.radar.RadarRepository.FirstSeen;
import com.apptracker.radar.RadarRepository.Ratings;
import com.apptracker.radar.RadarRepository.ScopeChart;
import com.apptracker.radar.RadarScorer.Facts;
import com.apptracker.radar.RadarScorer.Move;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * The Radar, computed at read time from the existing history (like M9's alerts)
 * and cached for 10 minutes per parameter set. Theme and dismissal writes clear the cache.
 */
@Service
public class RadarService {

    /** The period is a number of days: "4d" (the default), "14d", "30d" or any other from 1 to 90. */
    public static final String DEFAULT_WINDOW = "4d";
    static final int MAX_DAYS = 90;
    static final Duration CACHE_FOR = Duration.ofMinutes(10);
    static final int SHORT_HISTORY_DAYS = 7;
    static final int RATING_DAYS = 7;
    static final int MAX_APP_ROWS = 50;
    static final int MAX_WORDS = 30;
    static final int MAX_WORD_APPS = 12;
    static final int MAX_CLUSTERS = 20;
    static final int MAX_SCORE = Arrays.stream(Reason.values()).mapToInt(r -> r.points).sum();
    static final int NAME_MAX = 60;
    static final int KEYWORD_MAX = 40;
    static final int KEYWORDS_MAX = 20;

    private record Key(String country, Integer genreId, String window, boolean hideKnown, boolean showDismissed,
                       int minScore) {
    }

    private record Cached(Instant at, RadarResponse response) {
    }

    private final RadarRepository repo;
    private final QueryRepository query;
    private final Clock clock;
    private final int gapFactor;
    private final Map<Key, Cached> cache = new ConcurrentHashMap<>();

    public RadarService(RadarRepository repo, QueryRepository query, Clock clock, AppProperties props) {
        this.repo = repo;
        this.query = query;
        this.clock = clock;
        this.gapFactor = props.events().gapFactor();
    }

    // ------------------------------------------------------------------ reads

    public RadarResponse radar(String country, Integer genreId, String window, boolean hideKnown,
                               boolean showDismissed, int minScore) {
        Map<String, String> errors = new LinkedHashMap<>();
        String c = country == null ? "" : country.trim().toLowerCase(Locale.ROOT);
        if (!c.matches("[a-z]{2}")) errors.put("country", "Must be a 2-letter country code");
        String w = window(window);
        if (w == null) errors.put("window", "Must be a number of days from 1 to " + MAX_DAYS + ", e.g. 4d, 14d or 30d");
        if (genreId != null && genreId <= 0) errors.put("genre", "Must be a genre id");
        if (minScore < 0 || minScore > MAX_SCORE) errors.put("minScore", "Must be between 0 and " + MAX_SCORE);
        if (!errors.isEmpty()) throw new ValidationException(errors);

        Key key = new Key(c, genreId, w, hideKnown, showDismissed, minScore);
        Instant now = clock.instant();
        Cached hit = cache.get(key);
        if (hit != null && now.isBefore(hit.at().plus(CACHE_FOR))) return hit.response();
        cache.values().removeIf(e -> !now.isBefore(e.at().plus(CACHE_FOR)));
        RadarResponse fresh = compute(key, now);
        cache.put(key, new Cached(now, fresh));
        return fresh;
    }

    private RadarResponse compute(Key k, Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        Instant periodStart = now.minus(Duration.ofMinutes(TimeWindow.parse(k.window(), DEFAULT_WINDOW).minutes()));
        Instant baselineStart = periodStart.minus(Duration.ofDays(EmergingWords.BASELINE_DAYS));
        Instant followersFrom = periodStart.minus(Duration.ofDays(Clusters.FOLLOWER_EXTRA_DAYS));
        List<String> notes = new ArrayList<>();

        List<String> enabledCountries = repo.enabledCountries();
        if (enabledCountries.size() <= 1) notes.add("ONLY_ONE_COUNTRY");
        List<ScopeChart> charts = repo.scopeCharts(k.country(), k.genreId(), periodStart).stream()
                .filter(ch -> ch.firstValid() != null).toList();
        if (charts.isEmpty()) {
            notes.add("NO_CHARTS");
            return new RadarResponse(k.country(), k.genreId(), k.window(), null, null, k.hideKnown(), k.minScore(), 0,
                    List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), notes);
        }
        Map<Long, ScopeChart> chartById = charts.stream().collect(Collectors.toMap(ScopeChart::id, ch -> ch));
        Instant dataSince = charts.stream().map(ScopeChart::firstValid).min(Comparator.naturalOrder()).orElseThrow();
        Instant asOf = charts.stream().map(ScopeChart::latest).filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
        if (dataSince.isAfter(now.minus(Duration.ofDays(SHORT_HISTORY_DAYS)))) notes.add("SHORT_HISTORY");
        if (dataSince.isAfter(baselineStart)) notes.add("BASELINE_SHORT");

        // First appearance of each app in the scope (from ranking), and the period's readings.
        Map<Long, FirstSeen> first = new HashMap<>();
        for (FirstSeen f : repo.firstSeen(chartById.keySet())) {
            first.merge(f.appId(), f, (a, b) -> b.at().isBefore(a.at()) ? b : a);
        }
        Map<Long, Map<Long, List<RadarScorer.Reading>>> readings = repo.periodReadings(chartById.keySet(), periodStart);

        // The population: apps first seen since the baseline started, or ranked in the period.
        Set<Long> population = new HashSet<>(readings.keySet());
        first.values().stream().filter(f -> !f.at().isBefore(baselineStart)).forEach(f -> population.add(f.appId()));
        Map<Long, AppInfo> info = repo.apps(k.country(), population);
        population.retainAll(info.keySet());

        KnownThemes known = new KnownThemes(repo.themes().stream().filter(Theme::active)
                .flatMap(t -> t.keywords().stream()).toList());
        List<String> categoryNames = new ArrayList<>(charts.stream().map(ScopeChart::genreName).distinct().toList());
        categoryNames.add("Games");
        Words words = new Words(categoryNames);
        Set<Long> dismissed = repo.dismissed();
        Instant trackerStart = repo.trackerStart().orElse(dataSince);

        // Each app's move in each chart of the scope, and its best chart now.
        Map<Long, Map<Long, Move>> moves = new HashMap<>();
        Map<Long, Long> bestChart = new HashMap<>();
        readings.forEach((app, byChart) -> byChart.forEach((chartId, list) -> {
            ScopeChart ch = chartById.get(chartId);
            Move m = Move.of(list, ch.periodFirst(), ch.latest(), ch.depth(), ch.intervalMinutes(), gapFactor);
            moves.computeIfAbsent(app, x -> new HashMap<>()).put(chartId, m);
            if (m.currentRank() == null) return;
            Long best = bestChart.get(app);
            if (best == null || m.currentRank() < moves.get(app).get(best).currentRank()) bestChart.put(app, chartId);
        }));

        // Only apps that reached the body of a chart (its top 75%) count as new: the last
        // ranks of Apple's 100-entry feeds churn with old apps dropping in and out.
        Set<Long> reachedBody = new HashSet<>();
        moves.forEach((app, byChart) -> {
            if (byChart.values().stream().anyMatch(Move::reachedBody)) reachedBody.add(app);
        });
        Predicate<Long> isNew = id -> reachedBody.contains(id) && newSince(first.get(id), chartById, periodStart);
        Predicate<Long> followerEligible = id -> reachedBody.contains(id) && newSince(first.get(id), chartById, followersFrom);
        Map<Long, String> text = new HashMap<>();
        Map<Long, Set<String>> appWords = new HashMap<>();
        for (long id : population) {
            AppInfo a = info.get(id);
            text.put(id, a.name() + " " + Words.subtitle(a.summary()));
            appWords.put(id, words.words(text.get(id)));
        }

        // Emerging words and clusters.
        List<AppWords> pop = population.stream().map(id -> new AppWords(id, info.get(id).developerId(),
                first.containsKey(id) ? first.get(id).at() : null, isNew.test(id), appWords.get(id))).toList();
        Predicate<String> hiddenWord = k.hideKnown() ? known::isThemeWord : w -> false;
        List<Word> emerging = EmergingWords.find(pop, baselineStart, hiddenWord);
        Set<String> emergingSet = emerging.stream().map(Word::word).collect(Collectors.toSet());
        List<Member> members = pop.stream().filter(a -> a.firstSeen() != null)
                .map(a -> new Member(a.appId(), a.developerId(), a.firstSeen(), a.words(),
                        String.join(" ", words.words(info.get(a.appId()).name())), followerEligible.test(a.appId())))
                .toList();
        List<Cluster> clusters = Clusters.find(members, emergingSet,
                m -> (!k.showDismissed() && dismissed.contains(m.appId()))
                        || (k.hideKnown() && known.matches(text.get(m.appId()))));
        Set<Long> originators = clusters.stream().map(Cluster::originatorId).collect(Collectors.toSet());

        // Where every app ranks now, in every enabled country.
        List<ChartRank> latest = repo.latestRanks(RadarScorer.WARM_UP);
        Map<Long, Set<String>> countriesOf = new HashMap<>();
        latest.forEach(r -> countriesOf.computeIfAbsent(r.appId(), x -> new TreeSet<>()).add(r.country()));

        Map<Long, Ratings> ratings = repo.ratings(k.country(), population, today.minusDays(RATING_DAYS));
        Map<Long, Integer> gains = new HashMap<>();
        ratings.forEach((app, r) -> {
            if (r.days() >= 2 && r.first() != null && r.last() != null) gains.put(app, r.last() - r.first());
        });
        Map<Long, Integer> rankedGains = new HashMap<>(gains);
        rankedGains.keySet().retainAll(bestChart.keySet());
        Set<Long> fast = RadarScorer.fastest(rankedGains);

        // App rows.
        Map<Long, String> chartKey = charts.stream().collect(Collectors.toMap(ScopeChart::id, ScopeChart::key));
        record Candidate(long appId, long chartId, Move move, List<Reason> reasons, int score) {
        }
        BiFunction<Long, Long, Candidate> score = (app, chartId) -> {
            AppInfo a = info.get(app);
            Move m = moves.get(app).get(chartId);
            Ratings r = gains.containsKey(app) ? ratings.get(app) : null;
            Facts f = new Facts(a.releaseDate(), isNew.test(app), m,
                    r == null ? null : r.first(), r == null ? null : r.last(), fast.contains(app),
                    !known.matches(text.get(app)), originators.contains(app),
                    countriesOf.getOrDefault(app, Set.of()).size(),
                    reachedBody.contains(app) && a.developerFirstSeen() != null
                            && RadarScorer.isNew(a.developerFirstSeen(), trackerStart, periodStart));
            List<Reason> reasons = RadarScorer.reasons(f, today);
            return new Candidate(app, chartId, m, reasons, RadarScorer.score(reasons));
        };

        List<Candidate> newcomers = new ArrayList<>();
        bestChart.forEach((app, chartId) -> {
            Candidate cand = score.apply(app, chartId);
            if (isNew.test(app) || cand.reasons().contains(Reason.NEW_APP)) newcomers.add(cand);
        });
        Map<Long, Candidate> risingByApp = new HashMap<>();
        moves.forEach((app, byChart) -> byChart.forEach((chartId, m) -> {
            if (!m.bottomToTop() || !m.steps().steady() || !info.containsKey(app)) return;
            Candidate cand = score.apply(app, chartId);
            risingByApp.merge(app, cand, (a, b) -> b.move().placesGained() > a.move().placesGained() ? b : a);
        }));

        Comparator<Candidate> order = Comparator.<Candidate>comparingInt(c -> -c.score())
                .thenComparing(c -> c.move().placesGained(), Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(c -> c.move().currentRank(), Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparingLong(Candidate::appId);
        int[] hiddenByScore = {0};
        Function<Collection<Candidate>, List<Candidate>> keep = list -> {
            List<Candidate> out = new ArrayList<>();
            for (Candidate cand : list.stream().sorted(order).toList()) {
                if (!k.showDismissed() && dismissed.contains(cand.appId())) continue;
                if (cand.score() < k.minScore()) {
                    hiddenByScore[0]++;
                    continue;
                }
                if (out.size() < MAX_APP_ROWS) out.add(cand);
            }
            return out;
        };
        List<Candidate> newcomerRows = keep.apply(newcomers);
        List<Candidate> risingRows = keep.apply(risingByApp.values());

        // Clusters: biggest first, at most 20.
        List<Cluster> clusterRows = clusters.stream()
                .sorted(Comparator.<Cluster>comparingInt(cl -> -cl.followerIds().size()).thenComparingLong(Cluster::originatorId))
                .limit(MAX_CLUSTERS).toList();
        List<Word> wordRows = emerging.stream().limit(MAX_WORDS).toList();

        // Seen abroad, not here yet.
        List<AbroadNotHere.Row> abroadRows = List.of();
        List<Word> abroadWords = List.of();
        Map<Long, String> abroadCountry = new HashMap<>();
        if (enabledCountries.size() > 1) {
            Set<Integer> genresHere = charts.stream().map(ScopeChart::genreId).collect(Collectors.toSet());
            Set<Long> maybe = latest.stream().filter(r -> !r.country().equals(k.country()) && r.rank() <= AbroadNotHere.TOP
                    && genresHere.contains(r.genreId())).map(ChartRank::appId).collect(Collectors.toSet());
            abroadRows = AbroadNotHere.find(latest, k.country(), genresHere, repo.everRanked(k.country(), maybe)).stream()
                    .filter(r -> k.showDismissed() || !dismissed.contains(r.appId())).toList();
            abroadRows.forEach(r -> abroadCountry.put(r.appId(), r.ranks().get(0).country()));
            Map<Long, AppInfo> abroadInfo = new HashMap<>();
            groupByCountry(abroadCountry).forEach((country, ids) -> abroadInfo.putAll(repo.apps(country, ids)));
            List<AppWords> abroadApps = abroadRows.stream().filter(r -> abroadInfo.containsKey(r.appId())).map(r -> {
                AppInfo a = abroadInfo.get(r.appId());
                return new AppWords(r.appId(), a.developerId(), r.ranks().get(0).since(), false,
                        words.words(a.name() + " " + Words.subtitle(a.summary())));
            }).toList();
            abroadWords = AbroadNotHere.words(abroadApps, pop, hiddenWord).stream().limit(MAX_WORDS).toList();
            abroadRows = abroadRows.stream().limit(MAX_APP_ROWS).toList();
        }

        // Cards (names in the scope's country; abroad apps in the country they rank in) and trends.
        Set<Long> hereIds = new HashSet<>();
        newcomerRows.forEach(c -> hereIds.add(c.appId()));
        risingRows.forEach(c -> hereIds.add(c.appId()));
        wordRows.forEach(wd -> hereIds.addAll(wd.appIds().stream().limit(MAX_WORD_APPS).toList()));
        clusterRows.forEach(cl -> {
            hereIds.add(cl.originatorId());
            hereIds.addAll(cl.followerIds());
        });
        Map<Long, AppCard> cards = new HashMap<>(query.cards(k.country(), hereIds));
        abroadWords.forEach(wd -> wd.appIds().stream().limit(MAX_WORD_APPS).forEach(id -> abroadCountry.putIfAbsent(id, k.country())));
        Map<Long, String> abroadCards = new HashMap<>(abroadCountry);
        abroadCards.keySet().removeAll(cards.keySet());
        groupByCountry(abroadCards).forEach((country, ids) -> cards.putAll(query.cards(country, ids)));

        Map<Long, Set<Long>> trendApps = new HashMap<>();
        newcomerRows.forEach(c -> trendApps.computeIfAbsent(c.chartId(), x -> new HashSet<>()).add(c.appId()));
        risingRows.forEach(c -> trendApps.computeIfAbsent(c.chartId(), x -> new HashSet<>()).add(c.appId()));
        clusterRows.forEach(cl -> {
            Long ch = bestChart.get(cl.originatorId());
            if (ch != null) trendApps.computeIfAbsent(ch, x -> new HashSet<>()).add(cl.originatorId());
        });
        Map<Long, Map<Long, List<Point>>> trends = new HashMap<>();
        trendApps.forEach((chartId, ids) -> {
            ScopeChart ch = chartById.get(chartId);
            int step = TimeWindow.parse(k.window(), DEFAULT_WINDOW).stepMinutes(null, ch.intervalMinutes());
            trends.put(chartId, query.series(chartId, ids, periodStart, now, step));
        });

        Function<Candidate, RadarApp> toRow = c -> {
            AppInfo a = info.get(c.appId());
            Ratings r = gains.containsKey(c.appId()) ? ratings.get(c.appId()) : null;
            return new RadarApp(cards.get(c.appId()), chartKey.get(c.chartId()), c.move().currentRank(),
                    c.move().startRank(), c.move().placesGained(),
                    r == null ? null : gains.get(c.appId()),
                    r == null ? null : RadarScorer.growthPercent(r.first(), r.last()),
                    a.releaseDate() == null ? null : (int) ChronoUnit.DAYS.between(a.releaseDate(), today),
                    first.containsKey(c.appId()) ? first.get(c.appId()).at() : null,
                    c.reasons().stream().map(Enum::name).toList(), c.score(), dismissed.contains(c.appId()),
                    trends.getOrDefault(c.chartId(), Map.of()).getOrDefault(c.appId(), List.of()));
        };
        Function<Word, RadarWord> toWord = wd -> new RadarWord(wd.word(), wd.appIds().size(),
                wd.developers(), wd.firstSeen(),
                wd.appIds().stream().limit(MAX_WORD_APPS).map(cards::get).filter(Objects::nonNull).toList());

        List<RadarCluster> clusterOut = clusterRows.stream().map(cl -> {
            List<Long> all = new ArrayList<>();
            all.add(cl.originatorId());
            all.addAll(cl.followerIds());
            int gained = 0;
            Integer ratingsGained = null;
            Set<String> countries = new HashSet<>();
            for (long id : all) {
                Long ch = bestChart.get(id);
                Integer g = ch == null ? null : moves.get(id).get(ch).placesGained();
                if (g != null && g > 0) gained += g;
                if (gains.containsKey(id)) ratingsGained = (ratingsGained == null ? 0 : ratingsGained) + gains.get(id);
                countries.addAll(countriesOf.getOrDefault(id, Set.of()));
            }
            Long ch = bestChart.get(cl.originatorId());
            return new RadarCluster(cards.get(cl.originatorId()), ch == null ? null : chartKey.get(ch),
                    first.get(cl.originatorId()).at(),
                    ch == null ? List.of() : trends.getOrDefault(ch, Map.of()).getOrDefault(cl.originatorId(), List.of()),
                    cl.followerIds().stream().map(cards::get).filter(Objects::nonNull).toList(),
                    cl.word(), gained, ratingsGained, countries.size(), dismissed.contains(cl.originatorId()));
        }).toList();

        List<RadarAbroad> abroadOut = abroadRows.stream().map(r -> new RadarAbroad(cards.get(r.appId()),
                r.ranks().stream().map(x -> new AbroadRank(x.chartKey(), x.country(), x.rank(), x.since())).toList(),
                r.countries(), dismissed.contains(r.appId()))).toList();

        return new RadarResponse(k.country(), k.genreId(), k.window(), asOf, dataSince, k.hideKnown(), k.minScore(),
                hiddenByScore[0],
                newcomerRows.stream().map(toRow).toList(),
                risingRows.stream().map(toRow).toList(),
                wordRows.stream().map(toWord).toList(),
                clusterOut,
                abroadOut,
                abroadWords.stream().map(toWord).toList(),
                notes);
    }

    /** "14d", "14D", " 14d " → "14d"; null when not a number of days from 1 to 90 (missing = the default). */
    static String window(String raw) {
        if (raw == null || raw.isBlank()) return DEFAULT_WINDOW;
        String w = raw.trim().toLowerCase(Locale.ROOT);
        if (!w.matches("[1-9][0-9]{0,2}d")) return null;
        int days = Integer.parseInt(w.substring(0, w.length() - 1));
        return days <= MAX_DAYS ? days + "d" : null;
    }

    /** New since `from`: first seen then or later, and after its chart's warm-up. */
    private static boolean newSince(FirstSeen f, Map<Long, ScopeChart> charts, Instant from) {
        return f != null && RadarScorer.isNew(f.at(), charts.get(f.chartId()).firstValid(), from);
    }

    private static Map<String, List<Long>> groupByCountry(Map<Long, String> countryOf) {
        Map<String, List<Long>> out = new HashMap<>();
        countryOf.forEach((id, country) -> out.computeIfAbsent(country, x -> new ArrayList<>()).add(id));
        return out;
    }

    // ----------------------------------------------------------------- themes

    public List<Theme> themes() {
        return repo.themes();
    }

    public Theme createTheme(ThemeRequest in) {
        Map<String, String> errors = new LinkedHashMap<>();
        String name = name(in.name(), true, errors);
        List<String> keywords = keywords(in.keywords(), true, errors);
        if (!errors.isEmpty()) throw new ValidationException(errors);
        long id;
        try {
            id = repo.createTheme(name, keywords);
        } catch (DuplicateKeyException e) {
            throw new ConflictException("A theme named \"" + name + "\" already exists");
        }
        if (Boolean.FALSE.equals(in.active())) repo.updateTheme(id, null, null, false);
        cache.clear();
        return repo.theme(id).orElseThrow();
    }

    public Theme updateTheme(long id, ThemeRequest in) {
        repo.theme(id).orElseThrow(() -> new NotFoundException("No theme " + id));
        Map<String, String> errors = new LinkedHashMap<>();
        String name = name(in.name(), false, errors);
        List<String> keywords = keywords(in.keywords(), false, errors);
        if (!errors.isEmpty()) throw new ValidationException(errors);
        try {
            repo.updateTheme(id, name, keywords, in.active());
        } catch (DuplicateKeyException e) {
            throw new ConflictException("A theme named \"" + name + "\" already exists");
        }
        cache.clear();
        return repo.theme(id).orElseThrow();
    }

    private static String name(String raw, boolean required, Map<String, String> errors) {
        if (raw == null) {
            if (required) errors.put("name", "Required");
            return null;
        }
        String name = raw.strip().replaceAll("\\s+", " ");
        if (name.isEmpty()) errors.put("name", "Required");
        else if (name.length() > NAME_MAX) errors.put("name", "At most " + NAME_MAX + " characters");
        return name;
    }

    /** Lowercase, single spaces, no repeats; each must contain a letter or digit. */
    static List<String> keywords(List<String> raw, boolean required, Map<String, String> errors) {
        if (raw == null) {
            if (required) errors.put("keywords", "Add at least one keyword");
            return null;
        }
        Set<String> out = new LinkedHashSet<>();
        for (String k : raw) {
            String kw = k == null ? "" : k.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
            if (kw.isEmpty()) continue;
            if (kw.length() > KEYWORD_MAX || Words.tokens(kw).isEmpty()) {
                errors.put("keywords", "Each keyword needs a letter or digit and at most " + KEYWORD_MAX + " characters");
                return null;
            }
            out.add(kw);
        }
        if (out.isEmpty()) errors.put("keywords", "Add at least one keyword");
        else if (out.size() > KEYWORDS_MAX) errors.put("keywords", "At most " + KEYWORDS_MAX + " keywords");
        return List.copyOf(out);
    }

    // ------------------------------------------------------------- dismissals

    public Dismissal dismiss(DismissRequest in) {
        if (in.appleAppId() == null || in.appleAppId().isBlank()) throw new ValidationException("appleAppId", "Required");
        long appId = repo.appId(in.appleAppId().trim()).orElseThrow(() -> new NotFoundException("No app " + in.appleAppId()));
        boolean active = !Boolean.FALSE.equals(in.active());
        repo.setDismissed(appId, active);
        cache.clear();
        return new Dismissal(in.appleAppId().trim(), active);
    }
}
