package com.apptracker.radar;

import com.apptracker.radar.Clusters.Cluster;
import com.apptracker.radar.Clusters.Member;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClustersTest {

    private static final Instant T0 = Instant.parse("2026-10-01T00:00:00Z");

    private static Member app(long id, long dev, int day, String name, String... words) {
        return new Member(id, dev, T0.plus(Duration.ofDays(day)), Set.of(words), name, day > 0);
    }

    /** Filler apps so that "common" words are used by more than 2 apps. */
    private static List<Member> withCommon(List<Member> apps) {
        List<Member> out = new ArrayList<>(apps);
        for (long i = 100; i < 103; i++) out.add(app(i, i, 0, "filler " + i, "common"));
        return out;
    }

    @Test
    void theFirstAppSeenLeadsAndOtherDevelopersFollow() {
        List<Member> apps = withCommon(List.of(
                app(1, 10, 0, "sakura spin", "sakura", "spin"),
                app(2, 11, 3, "sakura rush", "sakura", "rush"),
                app(3, 12, 2, "sakura gold", "sakura", "gold")));
        List<Cluster> found = Clusters.find(apps, Set.of("sakura"), m -> false);
        assertEquals(List.of(new Cluster(1, List.of(3L, 2L), "sakura")), found);
    }

    @Test
    void followersFromTheSameDeveloperDontCount() {
        List<Member> apps = withCommon(List.of(
                app(1, 10, 0, "a", "sakura"),
                app(2, 10, 1, "b", "sakura"),
                app(3, 11, 2, "c", "sakura")));
        assertTrue(Clusters.find(apps, Set.of("sakura"), m -> false).isEmpty());
    }

    @Test
    void needsTwoFollowers() {
        List<Member> apps = withCommon(List.of(app(1, 10, 0, "a", "sakura"), app(2, 11, 1, "b", "sakura")));
        assertTrue(Clusters.find(apps, Set.of("sakura"), m -> false).isEmpty());
    }

    @Test
    void commonWordsDontLinkButCloseNamesDo() {
        List<Member> apps = withCommon(List.of(
                app(1, 10, 0, "tongits royale", "common"),
                app(2, 11, 1, "tongits royal", "common"),
                app(3, 12, 2, "tongitz royale", "common")));
        List<Cluster> found = Clusters.find(apps, Set.of(), m -> false);
        assertEquals(1, found.size());
        assertEquals(1, found.get(0).originatorId());
        assertNull(found.get(0).word());
    }

    @Test
    void anAppWithAnEarlierLookAlikeIsNotAnOriginator() {
        // App 2 has two followers, but app 1 (same word, seen first) leads the group.
        List<Member> apps = withCommon(List.of(
                app(1, 10, 0, "a", "sakura"),
                app(2, 11, 1, "b", "sakura"),
                app(3, 12, 2, "c", "sakura"),
                app(4, 13, 3, "d", "sakura")));
        List<Cluster> found = Clusters.find(apps, Set.of("sakura"), m -> false);
        assertEquals(1, found.size());
        assertEquals(1, found.get(0).originatorId());
        assertEquals(List.of(2L, 3L, 4L), found.get(0).followerIds());
    }

    @Test
    void hiddenOriginatorsAndIneligibleFollowers() {
        List<Member> apps = withCommon(List.of(
                app(1, 10, 0, "a", "sakura"),
                app(2, 11, 1, "b", "sakura"),
                app(3, 12, 0, "c", "sakura")));                 // same first day: seen at the start, not a follower
        assertTrue(Clusters.find(apps, Set.of("sakura"), m -> false).isEmpty());
        List<Member> three = withCommon(List.of(app(1, 10, 0, "a", "sakura"), app(2, 11, 1, "b", "sakura"),
                app(3, 12, 2, "c", "sakura")));
        assertTrue(Clusters.find(three, Set.of("sakura"), m -> m.appId() == 1).isEmpty());
    }

    @Test
    void jaroWinkler() {
        assertEquals(1.0, Clusters.jaroWinkler("tongits", "tongits"));
        assertEquals(0.961, Clusters.jaroWinkler("martha", "marhta"), 0.001);
        assertTrue(Clusters.jaroWinkler("tongits royale", "pusoy dos") < 0.9);
        assertEquals(0.0, Clusters.jaroWinkler("abc", "xyz"));
    }
}
