package com.apptracker.radar;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * New vocabulary: words of apps first seen within the period that the apps of
 * the 60 days before hardly used. Pure.
 */
public final class EmergingWords {

    private EmergingWords() {
    }

    static final int MIN_APPS = 3;
    static final int MIN_DEVELOPERS = 2;
    static final int MAX_BASELINE_APPS = 1;
    public static final int BASELINE_DAYS = 60;

    /**
     * An app's words.
     *
     * @param developerId null when unknown (the app then counts as its own developer)
     * @param isNew       first seen within the period (after the warm-up, see {@link RadarScorer#isNew})
     */
    public record AppWords(long appId, Long developerId, Instant firstSeen, boolean isNew, Set<String> words) {

        Object developerKey() {
            return developerId != null ? developerId : "app:" + appId;
        }
    }

    /** @param appIds the apps using it, earliest first */
    public record Word(String word, List<Long> appIds, int developers, Instant firstSeen) {
    }

    /**
     * @param baselineStart start of the 60 days before the period: older apps don't count
     * @param hidden        words to leave out, e.g. known themes' words when "hide known themes" is on
     */
    public static List<Word> find(Collection<AppWords> apps, Instant baselineStart, Predicate<String> hidden) {
        Map<String, List<AppWords>> fresh = new HashMap<>();
        Map<String, Integer> baseline = new HashMap<>();
        for (AppWords a : apps) {
            for (String w : a.words()) {
                if (a.isNew()) {
                    fresh.computeIfAbsent(w, k -> new ArrayList<>()).add(a);
                } else if (a.firstSeen() != null && !a.firstSeen().isBefore(baselineStart)) {
                    baseline.merge(w, 1, Integer::sum);
                }
            }
        }
        List<Word> out = new ArrayList<>();
        fresh.forEach((w, users) -> {
            if (users.size() < MIN_APPS || baseline.getOrDefault(w, 0) > MAX_BASELINE_APPS || hidden.test(w)) return;
            Set<Object> developers = new HashSet<>();
            users.forEach(u -> developers.add(u.developerKey()));
            if (developers.size() < MIN_DEVELOPERS) return;
            out.add(word(w, users, developers.size()));
        });
        out.sort(ORDER);
        return out;
    }

    static Word word(String w, List<AppWords> users, int developers) {
        List<AppWords> sorted = users.stream().sorted(EARLIEST).toList();
        return new Word(w, sorted.stream().map(AppWords::appId).toList(), developers, sorted.get(0).firstSeen());
    }

    static final Comparator<AppWords> EARLIEST = Comparator.comparing(AppWords::firstSeen,
            Comparator.nullsLast(Comparator.naturalOrder())).thenComparingLong(AppWords::appId);

    /** Most apps first, then most developers, then the newest, then alphabetical. */
    static final Comparator<Word> ORDER = Comparator.<Word>comparingInt(w -> -w.appIds().size())
            .thenComparingInt(w -> -w.developers())
            .thenComparing(Word::firstSeen, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(Word::word);
}
