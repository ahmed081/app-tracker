package com.apptracker.radar;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WordsTest {

    private final Words words = new Words(List.of("Casino", "Board", "Card"));

    @Test
    void lowercasesRemovesAccentsAndSplitsOnAnythingElse() {
        assertEquals(List.of("pusoy", "dos", "baraha", "jose"), List.copyOf(words.words("PUSOY-Dos: Baráha  (José)")));
    }

    @Test
    void dropsShortWordsNumbersYearsAndStopWords() {
        assertEquals(Set.of("tongit", "pinoy"),
                words.words("Tongits Pinoy 2026 - Free Online Card Game ng 99 sa Mga Laro ok"));
        assertTrue(words.words("Casino Board Games").isEmpty());          // category names are stop words
    }

    @Test
    void stemsTheTrailingS() {
        assertEquals(Words.tokens("slot"), Words.tokens("Slots"));
        assertEquals(List.of("chess"), Words.tokens("Chess"));              // "ss" stays
        assertEquals(List.of("bus"), Words.tokens("bus"));                  // too short to stem
    }

    @Test
    void keepsOtherScripts() {
        assertEquals(Set.of("شطرنج", "ملك"), words.words("شطرنج - ملك"));
        assertEquals(Set.of("شَطْرَنج"), words.words("شَطْرَنج"));           // Arabic marks don't split the word
        assertEquals(Set.of("麻将大师"), words.words("麻将大师"));
    }

    @Test
    void matchesPhrases() {
        KnownThemes themes = new KnownThemes(List.of("lucky 9", "slots", "pusoy dos"));
        assertTrue(themes.matches("Lucky 9 Online"));
        assertTrue(themes.matches("Mega Slot Machine"));
        assertFalse(themes.matches("Lucky Spin 99"));
        assertTrue(themes.isThemeWord("dos"));
        assertFalse(themes.isThemeWord("lucky9"));
    }

    @Test
    void subtitleIsTheFirstSentence() {
        assertEquals("Play Tongits with friends", Words.subtitle("Play Tongits with friends. Win big!\nMore text"));
        assertEquals("Line one", Words.subtitle("Line one\nLine two"));
        assertEquals("Chess.com is fun", Words.subtitle("Chess.com is fun"));   // a dot inside a word isn't an end
        assertEquals(120, Words.subtitle("x".repeat(500)).length());
        assertEquals("", Words.subtitle(null));
    }
}
