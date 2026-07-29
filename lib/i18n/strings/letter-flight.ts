import { defineStrings } from "@/lib/i18n";

export const letterFlightStrings = defineStrings({
  lt: {
    close: "Uždaryti",
    gone: "Laiškelio nebėra",

    stillFlying: "Šis laiškelis vis dar keliauja.",
    journeyOver: "Šio laiškelio kelionė jau baigta.",

    statStops: "Sustojimai",
    statHearts: "Širdelės",
    statTravelling: "Keliauja",
    daysSuffix: "{days} d.",

    countdownLabel: "Iki kelionės pabaigos",
    countdownDone: "Kelionė baigta",
    hoursMinutes: "{hours} val. {minutes} min.",
    daysHoursMinutes: "{days} d. {hours} val. {minutes} min.",

    sentOn: "išsiųstas {date}",
  },
  en: {
    close: "Close",
    gone: "This letter is gone",

    stillFlying: "This letter is still travelling.",
    journeyOver: "This letter's journey has already ended.",

    statStops: "Stops",
    statHearts: "Hearts",
    statTravelling: "Travelling",
    daysSuffix: "{days}d",

    countdownLabel: "Until the journey ends",
    countdownDone: "Journey over",
    hoursMinutes: "{hours}h {minutes}m",
    daysHoursMinutes: "{days}d {hours}h {minutes}m",

    sentOn: "sent {date}",
  },
});
