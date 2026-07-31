import { defineStrings } from "@/lib/i18n";

// app/(tabs)/letters.tsx — the "my letters" tab.
export const lettersStrings = defineStrings({
  lt: {
    title: "Laiškeliai",

    writeButton: "Parašyti laiškelį",
    receiveButton: "Gauti laiškelį",

    myLettersSectionTitle: "Mano laiškeliai",
    emptyText: "Kol kas nieko neparašei.",

    deleteConfirmTitle: "Ištrinti laiškelį?",
    deleteConfirmBody: "Šio veiksmo atšaukti negalėsi.",

    viewGraveLabel: "Peržiūrėti laiškelio kapą",
    viewFlightLabel: "Peržiūrėti keliaujantį laiškelį",
    deleteLetterLabel: "Ištrinti laiškelį",

    statusActive: "jam liko {days} d.",
    statusExpired: "nebegaliojantis",
    statusRemoved: "ištrintas moderatoriaus",

    statLikesFlying: "surinko beskraidant:",
    statLikesGrave: "surinko patekus į kapines:",
  },
  en: {
    title: "Letters",

    writeButton: "Write a letter",
    receiveButton: "Receive a letter",

    myLettersSectionTitle: "My letters",
    emptyText: "You haven't written anything yet.",

    deleteConfirmTitle: "Delete letter?",
    deleteConfirmBody: "This can't be undone.",

    viewGraveLabel: "View the letter's grave",
    viewFlightLabel: "View the letter in flight",
    deleteLetterLabel: "Delete letter",

    statusActive: "{days}d left",
    statusExpired: "no longer active",
    statusRemoved: "removed by a moderator",

    statLikesFlying: "earned while flying:",
    statLikesGrave: "earned resting here:",
  },
});
