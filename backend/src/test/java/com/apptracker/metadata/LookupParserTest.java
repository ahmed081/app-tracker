package com.apptracker.metadata;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LookupParserTest {

    private static String fixture(String name) throws IOException {
        try (var in = LookupParserTest.class.getResourceAsStream("/fixtures/" + name)) {
            if (in == null) throw new IOException("missing fixture " + name);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void parsesLookupResponse() throws IOException {
        Map<String, AppDetails> apps = LookupParser.parse(fixture("lookup-ph-sample.json"));
        assertEquals(2, apps.size());

        AppDetails t = apps.get("6738949114");
        assertNotNull(t);
        assertEquals("Tongits Go - Super Ace", t.name());
        assertEquals("com.tongitsland.game", t.bundleId());
        assertEquals("HIFUN GAMES", t.developerName());
        assertEquals("1783089640", t.appleDeveloperId());
        assertEquals("1.8.2", t.version());
        assertEquals(Instant.parse("2026-10-14T03:12:51Z"), t.versionReleasedAt());
        assertEquals(312547328L, t.sizeBytes());
        assertEquals(List.of("EN", "TL"), t.languages());
        assertEquals(List.of("6014", "7006", "6016", "7005"), t.genreIds());
        assertEquals(20418, t.ratingCount());
        assertEquals(0, new BigDecimal("4.71234").compareTo(t.rating()));
        assertEquals("17+", t.ageRating());
        assertTrue(t.iconUrl().endsWith("512x512bb.jpg"));
        assertEquals(2, t.screenshotUrls().size());

        AppDetails a = apps.get("6755110143");
        assertNull(a.releaseNotes());
        assertNull(a.ratingCurrentVersion());
        assertEquals(1, a.ipadScreenshotUrls().size());
    }

    @Test
    void missingAppsAreSimplyAbsent() throws IOException {
        Map<String, AppDetails> apps = LookupParser.parse("{\"resultCount\":0,\"results\":[]}");
        assertTrue(apps.isEmpty());
    }

    @Test
    void malformedBodyThrows() {
        boolean threw = false;
        try {
            LookupParser.parse("<html>blocked</html>");
        } catch (IOException e) {
            threw = true;
        }
        assertTrue(threw);
    }

    @Test
    void ratingChangesDoNotChangeTheContentHash() throws IOException {
        AppDetails d = LookupParser.parse(fixture("lookup-ph-sample.json")).get("6738949114");
        AppDetails moreRatings = new AppDetails(d.appleAppId(), d.name(), d.bundleId(), d.developerName(), d.sellerName(),
                d.appleDeveloperId(), d.description(), d.price(), d.currency(), d.formattedPrice(), d.ageRating(),
                d.version(), d.versionReleasedAt(), d.releaseNotes(), d.releasedAt(), d.sizeBytes(), d.minimumOsVersion(),
                d.languages(), d.primaryGenreId(), d.primaryGenreName(), d.genreIds(), d.iconUrl(), d.screenshotUrls(),
                d.ipadScreenshotUrls(), d.websiteUrl(), d.storeUrl(),
                new BigDecimal("4.8"), 25000, d.ratingCurrentVersion(), d.ratingCountCurrentVersion());
        assertEquals(d.contentHash(), moreRatings.contentHash());

        AppDetails newVersion = new AppDetails(d.appleAppId(), d.name(), d.bundleId(), d.developerName(), d.sellerName(),
                d.appleDeveloperId(), d.description(), d.price(), d.currency(), d.formattedPrice(), d.ageRating(),
                "1.9.0", d.versionReleasedAt(), d.releaseNotes(), d.releasedAt(), d.sizeBytes(), d.minimumOsVersion(),
                d.languages(), d.primaryGenreId(), d.primaryGenreName(), d.genreIds(), d.iconUrl(), d.screenshotUrls(),
                d.ipadScreenshotUrls(), d.websiteUrl(), d.storeUrl(),
                d.rating(), d.ratingCount(), d.ratingCurrentVersion(), d.ratingCountCurrentVersion());
        assertFalse(d.contentHash().equals(newVersion.contentHash()));
    }

    @Test
    void lookupUrlBatchesIds() {
        assertEquals("https://itunes.apple.com/lookup?id=1,2,3&country=ph&entity=software",
                LookupParser.lookupUrl("https://itunes.apple.com", "ph", List.of("1", "2", "3")));
    }
}
