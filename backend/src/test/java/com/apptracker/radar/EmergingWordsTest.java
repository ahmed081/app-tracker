package com.apptracker.radar;

import com.apptracker.radar.EmergingWords.AppWords;
import com.apptracker.radar.EmergingWords.Word;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EmergingWordsTest {

    private static final Instant PERIOD = Instant.parse("2026-10-09T00:00:00Z");
    private static final Instant BASELINE = PERIOD.minus(Duration.ofDays(60));

    private static AppWords fresh(long id, long dev, int day, String... words) {
        return new AppWords(id, dev, PERIOD.plus(Duration.ofDays(day)), true, Set.of(words));
    }

    private static AppWords old(long id, int daysBefore, String... words) {
        return new AppWords(id, 900 + id, PERIOD.minus(Duration.ofDays(daysBefore)), false, Set.of(words));
    }

    @Test
    void threeNewAppsFromTwoDevelopers() {
        List<AppWords> apps = List.of(fresh(1, 10, 3, "sakura"), fresh(2, 10, 1, "sakura"), fresh(3, 11, 2, "sakura"),
                fresh(4, 10, 1, "solo"), fresh(5, 10, 2, "solo"), fresh(6, 10, 3, "solo"),   // one developer only
                fresh(7, 10, 1, "pair"), fresh(8, 11, 1, "pair"));                         // two apps only
        List<Word> found = EmergingWords.find(apps, BASELINE, w -> false);
        assertEquals(1, found.size());
        Word w = found.get(0);
        assertEquals("sakura", w.word());
        assertEquals(List.of(2L, 3L, 1L), w.appIds());               // earliest first
        assertEquals(2, w.developers());
        assertEquals(PERIOD.plus(Duration.ofDays(1)), w.firstSeen());
    }

    @Test
    void theBaselineMayHaveUsedItOnceAtMost() {
        List<AppWords> apps = new ArrayList<>(List.of(fresh(1, 10, 1, "mega"), fresh(2, 11, 1, "mega"), fresh(3, 12, 1, "mega")));
        apps.add(old(4, 10, "mega"));
        assertEquals(1, EmergingWords.find(apps, BASELINE, w -> false).size());
        apps.add(old(5, 59, "mega"));
        assertTrue(EmergingWords.find(apps, BASELINE, w -> false).isEmpty());
        // Apps older than the 60-day baseline don't count.
        apps.remove(4);
        apps.add(old(6, 61, "mega"));
        assertEquals(1, EmergingWords.find(apps, BASELINE, w -> false).size());
    }

    @Test
    void knownThemesCanBeHidden() {
        List<AppWords> apps = List.of(fresh(1, 10, 1, "tongit"), fresh(2, 11, 1, "tongit"), fresh(3, 12, 1, "tongit"));
        KnownThemes themes = new KnownThemes(List.of("tongits"));
        assertTrue(EmergingWords.find(apps, BASELINE, themes::isThemeWord).isEmpty());
        assertEquals(1, EmergingWords.find(apps, BASELINE, w -> false).size());
    }

    @Test
    void unknownDevelopersCountAsTheirOwn() {
        List<AppWords> apps = List.of(new AppWords(1, null, PERIOD, true, Set.of("x1y")),
                new AppWords(2, null, PERIOD, true, Set.of("x1y")), new AppWords(3, null, PERIOD, true, Set.of("x1y")));
        assertEquals(3, EmergingWords.find(apps, BASELINE, w -> false).get(0).developers());
    }
}
