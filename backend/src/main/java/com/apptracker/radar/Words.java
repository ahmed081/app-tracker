package com.apptracker.radar;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Words of app names and subtitles: lowercase, accents removed, split on anything
 * that isn't a letter or digit (any script), simple "s" stemming. Drops words of
 * 2 characters or fewer, numbers and stop words (radar/stopwords.txt plus the
 * scope's category names).
 */
public final class Words {

    private static final Pattern SPLIT = Pattern.compile("[^\\p{L}\\p{M}\\p{N}]+");
    private static final Pattern ACCENTS = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");
    private static final Pattern NUMBER = Pattern.compile("\\p{N}+");
    private static final Pattern SENTENCE_END = Pattern.compile("\\R|[.!?](\\s|$)");
    private static final int SUBTITLE_MAX = 120;

    static final Set<String> STOP_WORDS = load();

    private final Set<String> stopWords;

    /** @param extraStopWords e.g. the scope's category names; split and stemmed like everything else */
    public Words(Collection<String> extraStopWords) {
        Set<String> s = new HashSet<>(STOP_WORDS);
        for (String extra : extraStopWords) s.addAll(tokens(extra));
        this.stopWords = Set.copyOf(s);
    }

    /** The words that count: no short words, numbers or stop words. In order of appearance, no repeats. */
    public Set<String> words(String text) {
        Set<String> out = new LinkedHashSet<>();
        for (String t : tokens(text)) {
            if (t.codePointCount(0, t.length()) <= 2 || NUMBER.matcher(t).matches() || stopWords.contains(t)) continue;
            out.add(t);
        }
        return out;
    }

    /** Every token, stemmed, nothing dropped (for phrase matching: "lucky 9"). */
    public static List<String> tokens(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        for (String t : SPLIT.split(normalize(text))) {
            if (!t.isEmpty()) out.add(stem(t));
        }
        return out;
    }

    static String normalize(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        return Normalizer.normalize(ACCENTS.matcher(Normalizer.normalize(lower, Normalizer.Form.NFD)).replaceAll(""),
                Normalizer.Form.NFC);
    }

    /** slots → slot. Nothing cleverer: "ss" endings and short words stay as they are. */
    static String stem(String w) {
        return w.length() > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.substring(0, w.length() - 1) : w;
    }

    /** True when the phrase's tokens appear one after another in the text's tokens. */
    public static boolean containsPhrase(List<String> text, List<String> phrase) {
        if (phrase.isEmpty() || phrase.size() > text.size()) return false;
        outer:
        for (int i = 0; i + phrase.size() <= text.size(); i++) {
            for (int j = 0; j < phrase.size(); j++) {
                if (!text.get(i + j).equals(phrase.get(j))) continue outer;
            }
            return true;
        }
        return false;
    }

    /**
     * Apple's feed has no subtitle; its summary is the whole description. Its first
     * sentence (or line), at most 120 characters, stands in for the subtitle.
     */
    public static String subtitle(String summary) {
        if (summary == null) return "";
        String s = summary.strip();
        var m = SENTENCE_END.matcher(s);
        if (m.find()) s = s.substring(0, m.start());
        return s.length() > SUBTITLE_MAX ? s.substring(0, SUBTITLE_MAX) : s;
    }

    private static Set<String> load() {
        try (InputStream in = Words.class.getResourceAsStream("/radar/stopwords.txt")) {
            if (in == null) throw new IllegalStateException("radar/stopwords.txt is missing");
            Set<String> out = new HashSet<>();
            for (String line : new String(in.readAllBytes(), StandardCharsets.UTF_8).split("\\R")) {
                if (line.isBlank() || line.strip().startsWith("#")) continue;
                out.addAll(tokens(line));
            }
            return Set.copyOf(out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
