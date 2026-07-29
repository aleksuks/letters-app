import { defineStrings } from "@/lib/i18n";

export const letterGraveStrings = defineStrings({
  lt: {
    close: "Uždaryti",
    gone: "Laiškelio nebėra",
    caption: "Šio laiškelio kelionė baigta.",

    peekDrawing: "Peržiūrėti prie kapo paliktą piešinį",
    closeDrawing: "Uždaryti piešinį",

    statStops: "Sustojimai",
    statHearts: "Širdelės",
    statLived: "Gyveno",
    daysSuffix: "{days} d.",
  },
  en: {
    close: "Close",
    gone: "This letter is gone",
    caption: "This letter's journey has ended.",

    peekDrawing: "View the drawing left at the grave",
    closeDrawing: "Close drawing",

    statStops: "Stops",
    statHearts: "Hearts",
    statLived: "Lived",
    daysSuffix: "{days}d",
  },
});
