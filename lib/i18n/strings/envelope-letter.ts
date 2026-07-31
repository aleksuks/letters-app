import { defineStrings } from "@/lib/i18n";

export const envelopeLetterStrings = defineStrings({
  lt: {
    waitingToClose: "Brūkštelėkite žemyn, kad uždarytumėte voką",
    waitingToSend: "Brūkštelėkite aukštyn, kad išsiųstumėte laiškelį",
    waitingToOpen: "Brūkštelėkite aukštyn, kad atplėštumėte voką",
    waitingToPull: "Brūkštelėkite aukštyn, kad ištrauktumėte laiškelį",
    waitingToPullBoth: "Brūkštelėkite aukštyn, kad ištrauktumėte laiškelį ir piešinį",
  },
  en: {
    waitingToClose: "Swipe down to seal the envelope",
    waitingToSend: "Swipe up to send the letter",
    waitingToOpen: "Swipe up to tear open the envelope",
    waitingToPull: "Swipe up to pull out the letter",
    waitingToPullBoth: "Swipe up to pull out the letter and the picture",
  },
});
