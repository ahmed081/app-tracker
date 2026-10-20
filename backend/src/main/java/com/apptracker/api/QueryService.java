package com.apptracker.api;

import com.apptracker.api.ApiModel.AppCard;
import com.apptracker.api.ApiModel.BumpResponse;
import com.apptracker.api.ApiModel.EventRow;
import com.apptracker.api.ApiModel.EventsResponse;
import com.apptracker.api.ApiModel.HeadlinesResponse;
import com.apptracker.api.ApiModel.LeftRow;
import com.apptracker.api.ApiModel.Mover;
import com.apptracker.api.ApiModel.MoversResponse;
import com.apptracker.api.ApiModel.NumberOne;
import com.apptracker.api.ApiModel.Point;
import com.apptracker.api.ApiModel.RankingResponse;
import com.apptracker.api.ApiModel.RankingRow;
import com.apptracker.api.ApiModel.Series;
import com.apptracker.api.QueryRepository.ChartRow;
import com.apptracker.api.QueryRepository.SnapRef;
import com.apptracker.config.AppProperties;
import com.apptracker.manage.RulesStore;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** Builds the chart screens (ranking, movers, headlines, events, bump chart). */
@Service
public class QueryService {

    static final List<String> TIER_EVENTS = List.of("REACHED_NUMBER_ONE", "LOST_NUMBER_ONE", "ENTERED_TOP_N", "LEFT_TOP_N");

    private final QueryRepository repo;
    private final RulesStore rules;
    private final int displayDepth;

    public QueryService(QueryRepository repo, RulesStore rules, AppProperties props) {
        this.repo = repo;
        this.rules = rules;
        this.displayDepth = props.events().displayDepth();
    }

    /** Headlines report entries into the largest tier in force (Top 10 by default). */
    private int headlineTier() {
        return rules.current().tiers().stream().max(Integer::compare).orElse(10);
    }

    // ---------------------------------------------------------------- ranking

    /**
     * The snapshot to compare with for a window ending at {@code now}: the last one at
     * or before the window start; when the chart is younger than the window, its first
     * snapshot (the response's windowAt then shows the shorter period actually covered).
     */
    Optional<SnapRef> windowSnapshot(long chartId, SnapRef now, TimeWindow window) {
        Instant start = now.slot().minus(Duration.ofMinutes(window.minutes()));
        return repo.atOrBefore(chartId, start)
                .or(() -> repo.earliest(chartId).filter(first -> first.slot().isBefore(now.slot())));
    }

    public RankingResponse ranking(ChartRow chart, TimeWindow window, int limit, int trendDays) {
        int depth = Math.min(limit, 200);
        Optional<SnapRef> cur = repo.latest(chart.id());
        if (cur.isEmpty()) {
            return new RankingResponse(chart.chart(), null, null, window.label(), null, List.of(), List.of());
        }
        SnapRef now = cur.get();
        Optional<SnapRef> prev = repo.before(chart.id(), now.slot());
        Optional<SnapRef> win = windowSnapshot(chart.id(), now, window);

        Map<Long, Integer> nowRanks = repo.ranks(now.id());
        Map<Long, Integer> prevRanks = prev.map(p -> repo.ranks(p.id())).orElse(Map.of());
        Map<Long, Integer> winRanks = win.map(w -> repo.ranks(w.id())).orElse(Map.of());

        List<Long> shown = nowRanks.entrySet().stream().filter(e -> e.getValue() <= depth).map(Map.Entry::getKey).toList();
        List<Long> left = prevRanks.entrySet().stream()
                .filter(e -> e.getValue() <= displayDepth)
                .filter(e -> !nowRanks.containsKey(e.getKey()) || nowRanks.get(e.getKey()) > displayDepth)
                .map(Map.Entry::getKey).toList();

        Set<Long> all = new LinkedHashSet<>(shown);
        all.addAll(left);
        Map<Long, AppCard> cards = repo.cards(chart.chart().country(), all);
        Map<Long, List<String>> badges = repo.badges(now.id());
        Map<Long, Boolean> rising = repo.rising(chart.id(), shown);
        Map<Long, List<Point>> trends = trendDays <= 0 ? Map.of()
                : repo.series(chart.id(), shown, now.slot().minus(Duration.ofDays(trendDays)), now.slot(),
                trendDays <= 1 ? 60 : 6 * 60);

        List<RankingRow> rows = new ArrayList<>();
        for (Long appId : shown) {
            int rank = nowRanks.get(appId);
            Integer p = prevRanks.get(appId);
            Integer w = winRanks.get(appId);
            rows.add(new RankingRow(
                    rank,
                    cards.get(appId),
                    p,
                    p == null ? null : p - rank,
                    prev.isEmpty() ? "NO_DATA" : status(p, rank),
                    w,
                    w == null ? null : w - rank,
                    win.isEmpty() ? "NO_DATA" : status(w, rank),
                    badges.getOrDefault(appId, List.of()),
                    rising.getOrDefault(appId, false),
                    trends.getOrDefault(appId, List.of())));
        }
        List<LeftRow> leftRows = left.stream()
                .map(id -> new LeftRow(cards.get(id), prevRanks.get(id), nowRanks.get(id)))
                .sorted(Comparator.comparingInt(LeftRow::previousRank))
                .toList();

        return new RankingResponse(chart.chart(), now.slot(), prev.map(SnapRef::slot).orElse(null), window.label(),
                win.map(SnapRef::slot).orElse(null), rows, leftRows);
    }

    static String status(Integer before, int now) {
        if (before == null) return "NEW";
        if (before > now) return "UP";
        if (before < now) return "DOWN";
        return "SAME";
    }

    // ----------------------------------------------------------------- movers

    /**
     * @param depth only apps ranked within this depth now or at the window start count
     *              (25 = the Top 25 shown to users; 200 = the whole chart)
     */
    public MoversResponse movers(ChartRow chart, TimeWindow window, int minPlaces, int limit, int depth) {
        Optional<SnapRef> cur = repo.latest(chart.id());
        if (cur.isEmpty()) {
            return new MoversResponse(chart.chart(), null, window.label(), null,
                    List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        }
        SnapRef now = cur.get();
        Instant windowStart = now.slot().minus(Duration.ofMinutes(window.minutes()));
        Optional<SnapRef> win = windowSnapshot(chart.id(), now, window);
        Map<Long, Integer> nowRanks = repo.ranks(now.id());
        Map<Long, Integer> winRanks = win.map(w -> repo.ranks(w.id())).orElse(Map.of());

        List<Move> climbers = new ArrayList<>();
        List<Move> fallers = new ArrayList<>();
        List<Move> entries = new ArrayList<>();
        List<Move> exits = new ArrayList<>();
        if (win.isPresent()) {
            Set<Long> ids = new HashSet<>(nowRanks.keySet());
            ids.addAll(winRanks.keySet());
            for (Long id : ids) {
                Move m = new Move(id, winRanks.get(id), nowRanks.get(id));
                boolean inNow = m.to() != null && m.to() <= depth;
                boolean inThen = m.from() != null && m.from() <= depth;
                if (!inNow && !inThen) continue;
                if (inNow && !inThen) entries.add(m);
                if (inThen && !inNow) exits.add(m);
                if (m.gained() != null && m.gained() >= minPlaces) climbers.add(m);
                if (m.gained() != null && -m.gained() >= minPlaces) fallers.add(m);
            }
        }
        climbers.sort(Comparator.comparingInt((Move m) -> -m.gained()).thenComparingInt(Move::to));
        fallers.sort(Comparator.comparingInt(Move::gained).thenComparingInt(Move::from));
        entries.sort(Comparator.comparingInt(Move::to));
        exits.sort(Comparator.comparingInt(Move::from));

        Map<Long, Integer> risingApps = repo.risingApps(chart.id(), limit);

        Set<Long> needCards = new HashSet<>(risingApps.keySet());
        for (List<Move> l : List.of(climbers, fallers, entries, exits)) {
            l.stream().limit(limit).forEach(m -> needCards.add(m.appId()));
        }
        Map<Long, AppCard> cards = repo.cards(chart.chart().country(), needCards);

        List<EventRow> tierCrossings = repo.withNames(repo.events(chart.id(), null, windowStart, now.slot(), 0,
                false, TIER_EVENTS, limit));

        List<Mover> rising = risingApps.entrySet().stream()
                .map(e -> new Mover(cards.get(e.getKey()), winRanks.get(e.getKey()), e.getValue(),
                        winRanks.containsKey(e.getKey()) ? winRanks.get(e.getKey()) - e.getValue() : null))
                .toList();

        return new MoversResponse(chart.chart(), now.slot(), window.label(), win.map(SnapRef::slot).orElse(null),
                toMovers(climbers, cards, limit), toMovers(fallers, cards, limit),
                toMovers(entries, cards, limit), toMovers(exits, cards, limit), rising, tierCrossings);
    }

    /** A rank change between the window start (from) and now (to); null = not ranked. */
    private record Move(long appId, Integer from, Integer to) {
        Integer gained() {
            return from != null && to != null ? from - to : null;
        }
    }

    private static List<Mover> toMovers(List<Move> moves, Map<Long, AppCard> cards, int limit) {
        return moves.stream().limit(limit)
                .map(m -> new Mover(cards.get(m.appId()), m.from(), m.to(), m.gained()))
                .toList();
    }

    // -------------------------------------------------------------- headlines

    public HeadlinesResponse headlines(ChartRow chart, TimeWindow window) {
        Optional<SnapRef> cur = repo.latest(chart.id());
        if (cur.isEmpty()) {
            return new HeadlinesResponse(chart.chart(), null, window.label(), null,
                    List.of(), List.of(), null, null, List.of(), true);
        }
        SnapRef now = cur.get();
        Instant since = now.slot().minus(Duration.ofMinutes(window.minutes()));

        NumberOne numberOne = null;
        Optional<Long> first = repo.ranks(now.id()).entrySet().stream()
                .filter(e -> e.getValue() == 1).map(Map.Entry::getKey).findFirst();
        if (first.isPresent()) {
            long appId = first.get();
            AppCard card = repo.cards(chart.chart().country(), List.of(appId)).get(appId);
            numberOne = new NumberOne(card, repo.inTierSince(chart.id(), appId, 1).orElse(null));
        }

        List<EventRow> newNumberOne = repo.withNames(repo.events(chart.id(), null, since, now.slot(), 0, false,
                List.of("REACHED_NUMBER_ONE"), 10));
        List<EventRow> enteredTop = repo.withNames(repo.events(chart.id(), null, since, now.slot(), 0, false,
                List.of("ENTERED_TOP_N"), 50)).stream().filter(e -> e.tier() != null && e.tier() == headlineTier())
                .limit(10).toList();
        List<EventRow> newEntries = repo.withNames(repo.events(chart.id(), null, since, now.slot(), 0, false,
                List.of("NEW_ENTRY", "RE_ENTRY"), 10));
        boolean quiet = repo.events(chart.id(), null, since, now.slot(), 3, false, null, 1).isEmpty();

        MoversResponse m = movers(chart, window, 1, 1, displayDepth);
        return new HeadlinesResponse(chart.chart(), now.slot(), window.label(), numberOne, newNumberOne, enteredTop,
                m.climbers().isEmpty() ? null : m.climbers().get(0),
                m.fallers().isEmpty() ? null : m.fallers().get(0),
                newEntries, quiet);
    }

    // ----------------------------------------------------------------- events

    public EventsResponse events(ChartRow chart, Instant since, Instant until, int minImportance, boolean primaryOnly,
                                 List<String> types, int limit) {
        Instant to = until != null ? until : Instant.now();
        Instant from = since != null ? since : to.minus(Duration.ofDays(7));
        return new EventsResponse(chart.chart(), repo.withNames(
                repo.events(chart.id(), null, from, to, minImportance, primaryOnly, types, limit)));
    }

    // ------------------------------------------------------------------- bump

    public BumpResponse bump(ChartRow chart, TimeWindow window, int top, Integer stepMinutes) {
        int step = window.stepMinutes(stepMinutes, chart.chart().intervalMinutes());
        Optional<SnapRef> cur = repo.latest(chart.id());
        if (cur.isEmpty()) return new BumpResponse(chart.chart(), window.label(), step, List.of());
        SnapRef now = cur.get();
        List<Long> apps = repo.ranks(now.id()).entrySet().stream()
                .filter(e -> e.getValue() <= top).map(Map.Entry::getKey).toList();
        Map<Long, AppCard> cards = repo.cards(chart.chart().country(), apps);
        Map<Long, List<Point>> series = repo.series(chart.id(), apps,
                now.slot().minus(Duration.ofMinutes(window.minutes())), now.slot(), step);
        List<Series> out = apps.stream().map(id -> new Series(cards.get(id), series.getOrDefault(id, List.of()))).toList();
        return new BumpResponse(chart.chart(), window.label(), step, out);
    }
}
