import { defineStrings } from "@/lib/i18n";

// app/(tabs)/map.tsx — the map tab.
export const mapStrings = defineStrings({
  lt: {
    mapAccessibilityLabel: "Lietuvos žemėlapis su laiškeliais",
    mapAccessibilityHint:
      "Žemėlapio turinys nepasiekiamas ekrano skaitytuvui. Naudok vietos paiešką, kad pereitum prie miesto.",

    searchButtonLabel: "Ieškoti vietos žemėlapyje",
    searchPlaceholder: "Miestas, miestelis, kaimas...",
    closeSearchLabel: "Uždaryti paiešką",
    searchEmpty: "Vietų nerasta",

    placePickedText: "Vieta pažymėta — rašyk laiškelį",
    placePendingText: "Bakstelėk vietą, kurioje nori palikti laiškelį",

    writeHereButton: "Rašyti čia",
    leaveLetterButton: "Palikti laiškelį",

    cardReadMore: "skaityti toliau…",
    cardHasDrawingLabel: "Yra piešinys",
  },
  en: {
    mapAccessibilityLabel: "Map of Lithuania with letters",
    mapAccessibilityHint:
      "The map's content isn't accessible to screen readers. Use place search to jump to a town.",

    searchButtonLabel: "Search for a place on the map",
    searchPlaceholder: "City, town, village...",
    closeSearchLabel: "Close search",
    searchEmpty: "No places found",

    placePickedText: "Spot marked — write your letter",
    placePendingText: "Tap the spot where you want to leave a letter",

    writeHereButton: "Write here",
    leaveLetterButton: "Leave a letter",

    cardReadMore: "read more…",
    cardHasDrawingLabel: "Has a drawing",
  },
});
