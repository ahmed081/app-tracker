package com.apptracker.radar;

import com.apptracker.radar.AbroadNotHere.ChartRank;
import com.apptracker.radar.AbroadNotHere.Row;
import com.apptracker.radar.EmergingWords.AppWords;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AbroadNotHereTest {

    private static final Instant T = Instant.parse("2026-10-20T00:00:00Z");

    private static ChartRank rank(long app, String country, int genre, int rank) {
        return new ChartRank(app, country, country + "/" + genre + "/top-free", genre, rank, T);
    }

    @Test
    void topTwentyFiveAbroadInACategoryTrackedHereNeverRankedHere() {
        List<ChartRank> latest = List.of(
                rank(1, "us", 7006, 3), rank(1, "gb", 7006, 9),      // abroad twice
                rank(2, "us", 7006, 26),                             // not Top 25
                rank(3, "us", 7001, 1),                              // category not tracked here
                rank(4, "us", 7006, 2),                              // ranked here before
                rank(5, "ph", 7006, 1),                              // here
                rank(6, "us", 7005, 12), rank(6, "ph", 7004, 90));   // ranks here now (in another category)
        List<Row> rows = AbroadNotHere.find(latest, "ph", Set.of(7004, 7005, 7006), Set.of(4L, 5L, 6L));
        assertEquals(1, rows.size());
        assertEquals(1, rows.get(0).appId());
        assertEquals(List.of("us/7006/top-free", "gb/7006/top-free"), rows.get(0).ranks().stream().map(ChartRank::chartKey).toList());
        assertEquals(List.of("gb", "us"), rows.get(0).countries());
    }

    @Test
    void wordsSeenAbroadNotHere() {
        List<AppWords> abroad = List.of(new AppWords(1, 10L, T, false, Set.of("sakura", "spin")),
                new AppWords(2, 11L, T, false, Set.of("sakura", "spin")));
        List<AppWords> here = List.of(new AppWords(3, 12L, T, false, Set.of("spin")),
                new AppWords(4, 13L, T, false, Set.of("spin")));
        assertEquals(List.of("sakura"), AbroadNotHere.words(abroad, here, w -> false).stream()
                .map(EmergingWords.Word::word).toList());
        assertTrue(AbroadNotHere.words(abroad, here, "sakura"::equals).isEmpty());
    }
}
