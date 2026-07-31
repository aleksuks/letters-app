import { defineStrings } from "@/lib/i18n";

// app/(tabs)/index.tsx — the Obituary tab.
export const homeStrings = defineStrings({
  lt: {
    title: "Kapinės",
    // Carries the old banner tip's one still-useful line — the double-tap
    // heart is otherwise invisible.
    subtitle: "Šiems laiškeliams kelionė jau baigta. Dukart bakstelėk laiškelį — paliksi jam širdelę.",

    sortPopularAll: "Populiariausi (visų laikų)",
    sortPopularMonth: "Populiariausi (šį mėnesį)",
    sortPopularWeek: "Populiariausi (šią savaitę)",
    sortRecent: "Naujausi",
    sortOriginal: "Daugiausiai surinkę dar beskraidant",
    closeSortMenu: "Uždaryti rikiavimo meniu",

    emptyText: "Kol kas jokių laiškelių.",
    emptyHint: "Seni arba nepatikę laiškeliai bus čia.",

    unknownAuthor: "nežinomas",
    livedLessThanDay: "gyveno < 1 d.",
    livedDays: "gyveno {days} d.",

    statLikesFlying: "surinko beskraidant:",
    statLikesGrave: "surinko patekus į kapines:",
    afterLikeGive: "Skirti širdelę po mirties",
    afterLikeUndo: "Atšaukti širdelę po mirties",
  },
  en: {
    title: "Obituary",
    subtitle: "These letters have finished their journey. Double-tap one to leave it a heart.",

    sortPopularAll: "Most liked (all time)",
    sortPopularMonth: "Most liked (this month)",
    sortPopularWeek: "Most liked (this week)",
    sortRecent: "Newest",
    sortOriginal: "Most liked while still flying",
    closeSortMenu: "Close sort menu",

    emptyText: "No letters yet.",
    emptyHint: "Old or unloved letters end up here.",

    unknownAuthor: "unknown",
    livedLessThanDay: "lived < 1d",
    livedDays: "lived {days}d",

    statLikesFlying: "earned while flying:",
    statLikesGrave: "earned resting here:",
    afterLikeGive: "Leave a heart, in memory",
    afterLikeUndo: "Take back the heart",
  },
});
