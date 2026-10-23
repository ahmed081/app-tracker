package com.apptracker.radar;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Possible new niches: an originator (the first app seen with a rare word or a
 * similar name) and its followers (later apps of other developers). "One app is
 * a hit; the copies make the niche", so a cluster needs 2 followers. Pure.
 */
public final class Clusters {

    private Clusters() {
    }

    static final int MIN_FOLLOWERS = 2;
    static final int RARE_MAX_APPS = 2;
    static final double SIMILAR_NAME = 0.9;
    public static final int FOLLOWER_EXTRA_DAYS = 30;

    /**
     * @param name             the name's words joined by spaces (stop words removed)
     * @param followerEligible first seen within the period plus 30 days, after the warm-up
     */
    public record Member(long appId, Long developerId, Instant firstSeen, Set<String> words, String name,
                         boolean followerEligible) {

        Object developerKey() {
            return developerId != null ? developerId : "app:" + appId;
        }
    }

    /** @param word the rare word the originator shares with most followers; null when only the names are close */
    public record Cluster(long originatorId, List<Long> followerIds, String word) {
    }

    /**
     * @param emergingWords words that count as rare whatever their use
     * @param hiddenOriginator originators to leave out (known themes, dismissed apps)
     */
    public static List<Cluster> find(Collection<Member> apps, Collection<String> emergingWords,
                                     Predicate<Member> hiddenOriginator) {
        List<Member> sorted = apps.stream().sorted(EARLIEST).toList();
        Map<String, Integer> uses = new HashMap<>();
        sorted.forEach(m -> m.words().forEach(w -> uses.merge(w, 1, Integer::sum)));
        Predicate<String> rare = w -> emergingWords.contains(w) || uses.getOrDefault(w, 0) <= RARE_MAX_APPS;

        List<Cluster> out = new ArrayList<>();
        for (int i = 0; i < sorted.size(); i++) {
            Member o = sorted.get(i);
            List<Member> followers = new ArrayList<>();
            for (int j = i + 1; j < sorted.size(); j++) {
                Member f = sorted.get(j);
                if (f.followerEligible() && !f.developerKey().equals(o.developerKey())
                        && f.firstSeen().isAfter(o.firstSeen()) && similar(o, f, rare)) {
                    followers.add(f);
                }
            }
            if (followers.size() < MIN_FOLLOWERS || hiddenOriginator.test(o)) continue;
            // The originator is the first app seen of its group: nothing similar came before it.
            boolean seenEarlier = false;
            for (int j = 0; j < i && !seenEarlier; j++) seenEarlier = similar(sorted.get(j), o, rare);
            if (seenEarlier) continue;
            out.add(new Cluster(o.appId(), followers.stream().map(Member::appId).toList(), sharedWord(o, followers, rare)));
        }
        return out;
    }

    static boolean similar(Member a, Member b, Predicate<String> rare) {
        for (String w : a.words()) {
            if (b.words().contains(w) && rare.test(w)) return true;
        }
        return !a.name().isEmpty() && !b.name().isEmpty() && jaroWinkler(a.name(), b.name()) >= SIMILAR_NAME;
    }

    private static String sharedWord(Member o, List<Member> followers, Predicate<String> rare) {
        String best = null;
        int bestCount = 0;
        for (String w : o.words()) {
            if (!rare.test(w)) continue;
            int n = (int) followers.stream().filter(f -> f.words().contains(w)).count();
            if (n > bestCount) {
                best = w;
                bestCount = n;
            }
        }
        return best;
    }

    /** Jaro-Winkler similarity, 0 (nothing alike) to 1 (equal). */
    static double jaroWinkler(String s, String t) {
        if (s.equals(t)) return 1;
        int range = Math.max(0, Math.max(s.length(), t.length()) / 2 - 1);
        boolean[] sm = new boolean[s.length()];
        boolean[] tm = new boolean[t.length()];
        int matches = 0;
        for (int i = 0; i < s.length(); i++) {
            for (int j = Math.max(0, i - range); j < Math.min(t.length(), i + range + 1); j++) {
                if (!tm[j] && s.charAt(i) == t.charAt(j)) {
                    sm[i] = tm[j] = true;
                    matches++;
                    break;
                }
            }
        }
        if (matches == 0) return 0;
        int transpositions = 0;
        for (int i = 0, k = 0; i < s.length(); i++) {
            if (!sm[i]) continue;
            while (!tm[k]) k++;
            if (s.charAt(i) != t.charAt(k)) transpositions++;
            k++;
        }
        double m = matches;
        double jaro = (m / s.length() + m / t.length() + (m - transpositions / 2.0) / m) / 3;
        int prefix = 0;
        while (prefix < Math.min(4, Math.min(s.length(), t.length())) && s.charAt(prefix) == t.charAt(prefix)) prefix++;
        return jaro + prefix * 0.1 * (1 - jaro);
    }

    static final Comparator<Member> EARLIEST = Comparator.comparing(Member::firstSeen).thenComparingLong(Member::appId);
}
