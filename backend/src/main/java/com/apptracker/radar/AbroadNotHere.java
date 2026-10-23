package com.apptracker.radar;

import com.apptracker.radar.EmergingWords.AppWords;
import com.apptracker.radar.EmergingWords.Word;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Predicate;

/**
 * Seen abroad, not here yet: apps in the Top 25 of another enabled country, in a
 * category also tracked here, that never ranked here. Pure.
 */
public final class AbroadNotHere {

    private AbroadNotHere() {
    }

    static final int TOP = 25;
    static final int WORD_MIN_APPS = 3;           // as emerging words: 2 apps are a coincidence
    static final int WORD_MIN_DEVELOPERS = 2;
    static final int WORD_MAX_HERE = 1;

    /**
     * An app's rank in the latest reading of an active chart.
     *
     * @param since in the chart's Top 25 since; null = since tracking began
     */
    public record ChartRank(long appId, String country, String chartKey, int genreId, int rank, Instant since) {
    }

    /** @param ranks the abroad Top 25 ranks, best first; @param countries every country it ranks in now */
    public record Row(long appId, List<ChartRank> ranks, List<String> countries) {
    }

    /**
     * @param latest         ranks in the latest reading of every active chart of every enabled country
     * @param here           the selected country
     * @param genresHere     categories tracked here (in the scope)
     * @param everRankedHere apps that ranked here at any time
     */
    public static List<Row> find(Collection<ChartRank> latest, String here, Set<Integer> genresHere,
                                 Set<Long> everRankedHere) {
        Map<Long, List<ChartRank>> abroad = new LinkedHashMap<>();
        Map<Long, Set<String>> countries = new HashMap<>();
        for (ChartRank r : latest) {
            countries.computeIfAbsent(r.appId(), k -> new TreeSet<>()).add(r.country());
            if (!r.country().equals(here) && r.rank() <= TOP && genresHere.contains(r.genreId())
                    && !everRankedHere.contains(r.appId())) {
                abroad.computeIfAbsent(r.appId(), k -> new ArrayList<>()).add(r);
            }
        }
        List<Row> out = new ArrayList<>();
        abroad.forEach((app, ranks) -> {
            ranks.sort(Comparator.comparingInt(ChartRank::rank).thenComparing(ChartRank::chartKey));
            out.add(new Row(app, List.copyOf(ranks), List.copyOf(countries.get(app))));
        });
        out.sort(Comparator.<Row>comparingInt(r -> r.ranks().get(0).rank())
                .thenComparingInt(r -> -r.countries().size())
                .thenComparingLong(Row::appId));
        return out;
    }

    /**
     * Words seen abroad, not here yet: used by 3 or more of the abroad apps, from 2
     * developers or more, and by 1 app here at most.
     *
     * @param abroadApps the words of the apps returned by {@link #find}
     * @param hereApps   the words of the apps ranked here (the scope's population)
     */
    public static List<Word> words(Collection<AppWords> abroadApps, Collection<AppWords> hereApps,
                                   Predicate<String> hidden) {
        Map<String, Integer> usedHere = new HashMap<>();
        hereApps.forEach(a -> a.words().forEach(w -> usedHere.merge(w, 1, Integer::sum)));
        Map<String, List<AppWords>> users = new HashMap<>();
        abroadApps.forEach(a -> a.words().forEach(w -> users.computeIfAbsent(w, k -> new ArrayList<>()).add(a)));
        List<Word> out = new ArrayList<>();
        users.forEach((w, apps) -> {
            if (apps.size() < WORD_MIN_APPS || usedHere.getOrDefault(w, 0) > WORD_MAX_HERE || hidden.test(w)) return;
            Set<Object> developers = new HashSet<>();
            apps.forEach(a -> developers.add(a.developerKey()));
            if (developers.size() < WORD_MIN_DEVELOPERS) return;
            out.add(EmergingWords.word(w, apps, developers.size()));
        });
        out.sort(EmergingWords.ORDER);
        return out;
    }
}
