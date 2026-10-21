package com.apptracker.watch;

import com.apptracker.api.ApiModel.AppCard;
import com.apptracker.api.ApiModel.EventRow;
import com.apptracker.api.ApiModel.NumberOne;
import com.apptracker.api.ApiModel.Point;
import com.apptracker.api.NotFoundException;
import com.apptracker.api.QueryRepository;
import com.apptracker.api.QueryRepository.ChartRow;
import com.apptracker.api.QueryRepository.SnapRef;
import com.apptracker.api.QueryService;
import com.apptracker.api.TimeWindow;
import com.apptracker.manage.RulesStore;
import com.apptracker.manage.ValidationException;
import com.apptracker.watch.WatchModel.FollowRequest;
import com.apptracker.watch.WatchModel.Watch;
import com.apptracker.watch.WatchModel.WatchUpdate;
import com.apptracker.watch.WatchModel.WatchedApp;
import com.apptracker.watch.WatchModel.WatchedChart;
import com.apptracker.watch.WatchModel.WatchlistResponse;
import com.apptracker.watch.WatchRepository.WatchRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;

/** The shared watchlist: following, unfollowing, alert rules, and the "My watchlist" screen. */
@Service
public class WatchService {

    private final WatchRepository repo;
    private final QueryRepository query;
    private final QueryService queryService;
    private final RulesStore rules;

    public WatchService(WatchRepository repo, QueryRepository query, QueryService queryService, RulesStore rules) {
        this.repo = repo;
        this.query = query;
        this.queryService = queryService;
        this.rules = rules;
    }

    // --------------------------------------------------------------- watches

    /** Active watches, optionally only those covering an app and/or a chart (for Follow buttons). */
    public List<Watch> status(String appleAppId, String chartKey) {
        return repo.watches(true).stream().map(WatchRow::watch)
                .filter(w -> appleAppId == null || appleAppId.equals(w.appleAppId()))
                .filter(w -> chartKey == null || w.chartKey() == null || chartKey.equals(w.chartKey()))
                .toList();
    }

    @Transactional
    public Watch follow(FollowRequest in) {
        Map<String, String> errors = new LinkedHashMap<>();
        String kind = in.kind();
        Long appId = null;
        Long chartId = null;
        if (!WatchModel.APP.equals(kind) && !WatchModel.CHART.equals(kind)) errors.put("kind", "APP or CHART");
        if (WatchModel.APP.equals(kind)) {
            if (in.appleAppId() == null || in.appleAppId().isBlank()) errors.put("appleAppId", "Required");
            else appId = repo.appId(in.appleAppId().trim()).orElse(null);
            if (appId == null && !errors.containsKey("appleAppId")) errors.put("appleAppId", "Unknown app " + in.appleAppId());
        }
        if (WatchModel.CHART.equals(kind)) {
            if (in.appleAppId() != null) errors.put("appleAppId", "A chart watch follows no app");
            if (in.chartKey() == null) errors.put("chartKey", "Required");
        }
        if (in.chartKey() != null) {
            chartId = query.chartByKey(in.chartKey()).map(ChartRow::id).orElse(null);
            if (chartId == null) errors.put("chartKey", "Unknown chart " + in.chartKey());
        }
        if (!errors.isEmpty()) throw new ValidationException(errors);
        return repo.watch(repo.follow(kind, appId, chartId)).orElseThrow().watch();
    }

    /** Switches a watch on or off, and/or changes its alert rule. */
    @Transactional
    public Watch update(long id, WatchUpdate in) {
        WatchRow row = repo.watch(id).orElseThrow(() -> new NotFoundException("No watch " + id));
        if (in.rule() != null) {
            if (WatchModel.CHART.equals(row.watch().kind())) {
                throw new ValidationException("rule", "A chart watch alerts on its big moments; its rule cannot change");
            }
            Map<String, String> errors = in.rule().validate(rules.current().tiers());
            if (!errors.isEmpty()) throw new ValidationException(errors);
            repo.saveRule(id, in.rule().normalized());
        }
        if (in.active() != null) repo.setActive(id, in.active());
        return repo.watch(id).orElseThrow().watch();
    }

    // ------------------------------------------------------------- watchlist

    /** What one chart looks like now, computed once per request. */
    private record ChartView(ChartRow chart, SnapRef now, Optional<SnapRef> window,
                             Map<Long, Integer> ranks, Map<Long, Integer> windowRanks) {
    }

    public WatchlistResponse watchlist(TimeWindow window) {
        List<WatchRow> watches = repo.watches(true);
        Map<String, Optional<ChartView>> views = new HashMap<>();
        Function<String, Optional<ChartView>> view =
                key -> views.computeIfAbsent(key, k -> chartView(k, window));

        List<WatchedApp> apps = new ArrayList<>();
        List<WatchedChart> charts = new ArrayList<>();
        for (WatchRow row : watches) {
            Watch w = row.watch();
            if (WatchModel.CHART.equals(w.kind())) {
                view.apply(w.chartKey()).ifPresent(v -> charts.add(watchedChart(w, v)));
                continue;
            }
            List<String> keys = w.chartKey() != null ? List.of(w.chartKey()) : repo.rankedCharts(row.appId());
            if (keys.isEmpty()) {
                AppCard card = query.cards(repo.homeCountry(row.appId()), List.of(row.appId())).get(row.appId());
                apps.add(new WatchedApp(w.id(), true, w.rule(), null, card, null, null, "OUT", List.of(), null));
            }
            for (String key : keys) {
                view.apply(key).ifPresent(v -> apps.add(watchedApp(w, row.appId(), v)));
            }
        }
        apps.sort(Comparator.comparing((WatchedApp a) -> a.currentRank() == null ? Integer.MAX_VALUE : a.currentRank())
                .thenComparing(a -> a.app() == null ? "" : a.app().name()));
        Instant asOf = views.values().stream().flatMap(Optional::stream).map(v -> v.now() == null ? null : v.now().slot())
                .filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
        return new WatchlistResponse(window.label(), asOf, apps, charts);
    }

    private Optional<ChartView> chartView(String key, TimeWindow window) {
        return query.chartByKey(key).map(chart -> {
            Optional<SnapRef> now = query.latest(chart.id());
            if (now.isEmpty()) return new ChartView(chart, null, Optional.empty(), Map.of(), Map.of());
            Optional<SnapRef> win = queryService.windowSnapshot(chart.id(), now.get(), window);
            return new ChartView(chart, now.get(), win, query.ranks(now.get().id()),
                    win.map(s -> query.ranks(s.id())).orElse(Map.of()));
        });
    }

    private WatchedApp watchedApp(Watch w, long appId, ChartView v) {
        String country = v.chart().chart().country();
        AppCard card = query.cards(country, List.of(appId)).get(appId);
        boolean allCharts = w.chartKey() == null;
        if (v.now() == null) {
            return new WatchedApp(w.id(), allCharts, w.rule(), v.chart().chart().key(), card, null, null, "NO_DATA",
                    List.of(), null);
        }
        Integer rank = v.ranks().get(appId);
        Integer then = v.windowRanks().get(appId);
        String status = rank == null ? "OUT" : v.window().isEmpty() ? "NO_DATA" : QueryService.status(then, rank);
        Instant to = v.now().slot();
        int step = Math.max(6 * 60, v.chart().chart().intervalMinutes());
        List<Point> trend = query.series(v.chart().id(), List.of(appId), to.minus(Duration.ofDays(7)), to, step)
                .getOrDefault(appId, List.of());
        EventRow last = query.withNames(query.events(v.chart().id(), appId, to.minus(Duration.ofDays(90)), to, 2,
                true, null, 1)).stream().findFirst().orElse(null);
        return new WatchedApp(w.id(), allCharts, w.rule(), v.chart().chart().key(), card, rank,
                rank != null && then != null ? then - rank : null, status, trend, last);
    }

    private WatchedChart watchedChart(Watch w, ChartView v) {
        if (v.now() == null) return new WatchedChart(w.id(), v.chart().chart(), null, null);
        NumberOne numberOne = v.ranks().entrySet().stream().filter(e -> e.getValue() == 1).findFirst()
                .map(e -> new NumberOne(query.cards(v.chart().chart().country(), List.of(e.getKey())).get(e.getKey()),
                        query.inTierSince(v.chart().id(), e.getKey(), 1).orElse(null)))
                .orElse(null);
        int highest = BigMoments.highestTier(rules.current().tiers());
        Instant to = v.now().slot();
        EventRow lastKeyMove = query.withNames(query.events(v.chart().id(), null, to.minus(Duration.ofDays(30)), to, 0,
                        false, BigMoments.TYPES, 200).stream()
                .filter(e -> !e.gap() && BigMoments.matches(e.type(), e.tier(), e.currentRank(), highest))
                .limit(1).toList()).stream().findFirst().orElse(null);
        return new WatchedChart(w.id(), v.chart().chart(), numberOne, lastKeyMove);
    }
}
