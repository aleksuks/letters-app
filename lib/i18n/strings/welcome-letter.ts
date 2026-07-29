import { defineStrings } from "@/lib/i18n";

export const welcomeLetterStrings = defineStrings({
  lt: {
    close: "Uždaryti",
    dismissHint: "Brūkštelėk žemyn, kad uždarytum",
    body:
      "Sveiki!\n\n" +
      "„Laiškelyje“ slepiesi po slapyvardžiu ir rašai trumpus tekstus " +
      "nepažįstamiems.\n\n" +
      "Jei laiškelį palaikini, jis juda toliau pas kitą gavėją. Jei manai, " +
      "kad jis to nevertas, siunti į kapines - surinkus pakankamai balsų, " +
      "jis nebeskraido ir atgula poilsiui. Praėjus moderacijai, patenka į " +
      "pagrindinį puslapį visų teismui.\n\n" +
      "Jei laiškelis kažkam ant tiek patinka (ar nepatinka), kad nori " +
      "susisiekti su siuntėju - galima išsiųsti užklausas, ir jei siuntėjas " +
      "jas priima, rašinėtis privačiai.\n\n" +
      "Kol kas tiek.",
  },
  en: {
    close: "Close",
    dismissHint: "Swipe down to close",
    body:
      "Hello!\n\n" +
      "In Laiškelis, you hide behind a nickname and write short letters " +
      "to strangers.\n\n" +
      "If someone likes your letter, it travels on to another reader. If " +
      "they think it's not worth keeping around, they send it to the " +
      "graveyard — once enough votes pile up, it stops flying and settles " +
      "in for a rest. Once it clears moderation, it lands on the main page " +
      "for everyone to see.\n\n" +
      "If a letter strikes someone enough — for better or worse — that " +
      "they want to reach the sender, they can send a request, and if the " +
      "sender accepts, the two of you can write to each other privately.\n\n" +
      "That's it for now.",
  },
});
