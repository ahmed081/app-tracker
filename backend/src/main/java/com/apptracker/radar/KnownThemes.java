package com.apptracker.radar;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** The active themes' keywords, for "unknown theme" and "hide known themes". */
public final class KnownThemes {

    private final List<List<String>> phrases;
    private final Set<String> words = new HashSet<>();

    /** @param keywords every keyword of every active theme, e.g. "slots", "lucky 9" */
    public KnownThemes(Collection<String> keywords) {
        this.phrases = keywords.stream().map(Words::tokens).filter(p -> !p.isEmpty()).toList();
        phrases.forEach(words::addAll);
    }

    /** True when the text contains one of the keywords ("Lucky 9 Online" contains "lucky 9"). */
    public boolean matches(String text) {
        List<String> tokens = Words.tokens(text);
        return phrases.stream().anyMatch(p -> Words.containsPhrase(tokens, p));
    }

    /** True when the (stemmed) word is part of a keyword: "slot", "pusoy", "dos" of "pusoy dos". */
    public boolean isThemeWord(String word) {
        return words.contains(word);
    }
}
