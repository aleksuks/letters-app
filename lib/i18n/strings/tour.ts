import { defineStrings } from "@/lib/i18n";

// components/tour-spotlight.tsx — the one-step-at-a-time discovery tour.
// Each line is a single short sentence anchored to the control it points at;
// the step is dismissed by performing the action, so the copy must name the
// action, not describe the feature in full.
export const tourStrings = defineStrings({
  lt: {
    stepLettersTab: "Viskas prasideda čia — čia rašomi ir gaunami laiškeliai.",
    stepReceiveButton: "Tavęs jau laukia pirmasis laiškelis. Atplėšk!",
    stepMapTab:
      "Yra ir žemėlapio laiškeliai — ten gali palikti žinutes pagal lokaciją. Pasižiūrėk į kurį nors.",
    skip: "Praleisti susipažinimą",

    farewell:
      "Tiek tos pažinties. Toliau — kaip nori: skaityk, rašyk arba palik laiškelį žemėlapyje.",
    farewellButton: "Aišku",
  },
  en: {
    stepLettersTab: "It all starts here — letters are written and received on this tab.",
    stepReceiveButton: "Your first letter is already waiting. Open it!",
    stepMapTab:
      "There are map letters too — messages left at a specific spot. Go take a look at one.",
    skip: "Skip the intro",

    farewell:
      "That's the whole tour. From here it's yours: read, write, or leave a letter on the map.",
    farewellButton: "Got it",
  },
});
