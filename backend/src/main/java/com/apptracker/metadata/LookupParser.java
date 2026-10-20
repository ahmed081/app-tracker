package com.apptracker.metadata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The only place that knows the shape of Apple's Lookup API response:
 * {@code https://itunes.apple.com/lookup?id=1,2,3&country=ph}
 * → {@code {"resultCount": 2, "results": [{"trackId": 1, ...}]}}.
 */
public final class LookupParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LookupParser() {
    }

    public static String lookupUrl(String baseUrl, String countryCode, List<String> appleAppIds) {
        return baseUrl + "/lookup?id=" + String.join(",", appleAppIds) + "&country=" + countryCode + "&entity=software";
    }

    /** Apps found, keyed by Apple App ID. IDs missing from the map were not found. */
    public static Map<String, AppDetails> parse(String body) throws IOException {
        JsonNode root = MAPPER.readTree(body);
        if (root == null || !root.has("results")) throw new IOException("no results array");
        Map<String, AppDetails> out = new LinkedHashMap<>();
        for (JsonNode r : root.get("results")) {
            // Only apps; ignore anything else Apple might include.
            String wrapper = text(r, "wrapperType");
            if (wrapper != null && !wrapper.equals("software")) continue;
            String id = text(r, "trackId");
            if (id == null) continue;
            out.put(id, toDetails(id, r));
        }
        return out;
    }

    private static AppDetails toDetails(String id, JsonNode r) {
        return new AppDetails(
                id,
                text(r, "trackName") == null ? "" : text(r, "trackName"),
                text(r, "bundleId"),
                text(r, "artistName"),
                text(r, "sellerName"),
                text(r, "artistId"),
                text(r, "description"),
                decimal(r, "price"),
                text(r, "currency"),
                text(r, "formattedPrice"),
                text(r, "trackContentRating") != null ? text(r, "trackContentRating") : text(r, "contentAdvisoryRating"),
                text(r, "version"),
                instant(r, "currentVersionReleaseDate"),
                text(r, "releaseNotes"),
                instant(r, "releaseDate"),
                longValue(r, "fileSizeBytes"),
                text(r, "minimumOsVersion"),
                list(r, "languageCodesISO2A"),
                intValue(r, "primaryGenreId"),
                text(r, "primaryGenreName"),
                list(r, "genreIds"),
                text(r, "artworkUrl512") != null ? text(r, "artworkUrl512") : text(r, "artworkUrl100"),
                list(r, "screenshotUrls"),
                list(r, "ipadScreenshotUrls"),
                text(r, "sellerUrl"),
                text(r, "trackViewUrl"),
                decimal(r, "averageUserRating"),
                intValue(r, "userRatingCount"),
                decimal(r, "averageUserRatingForCurrentVersion"),
                intValue(r, "userRatingCountForCurrentVersion"));
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static BigDecimal decimal(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        try {
            return new BigDecimal(v.asText());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer intValue(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        try {
            return Integer.valueOf(v.asText());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Long longValue(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        try {
            return Long.valueOf(v.asText());   // Apple sends fileSizeBytes as a string
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Instant instant(JsonNode n, String field) {
        String s = text(n, field);
        if (s == null) return null;
        try {
            return Instant.parse(s);
        } catch (DateTimeParseException e) {
            try {
                return java.time.OffsetDateTime.parse(s).toInstant();
            } catch (DateTimeParseException e2) {
                return null;
            }
        }
    }

    private static List<String> list(JsonNode n, String field) {
        JsonNode v = n.get(field);
        List<String> out = new ArrayList<>();
        if (v != null && v.isArray()) v.forEach(x -> out.add(x.asText()));
        return out;
    }
}
