import { defineStrings } from "@/lib/i18n";

export const onboardingStrings = defineStrings({
  lt: {
    missingNicknameTitle: "Trūksta slapyvardžio",
    missingNicknameBody: "Įvesk bent 2 simbolių slapyvardį.",
    missingAgeTitle: "Trūksta patvirtinimo",
    missingAgeBody: "Patvirtink, jog esi pilnametis.",
    missingTermsTitle: "Trūksta sutikimo",
    missingTermsBody: "Sutik su naudojimo sąlygomis ir privatumo politika.",

    nicknameTakenTitle: "Vartotojo vardas užimtas",
    nicknameTakenBody: "Pabandyk kitą.",
    invalidNicknameScriptTitle: "Netinkamas slapyvardis",
    invalidNicknameScriptBody: "Slapyvardį galima rašyti tik lotyniškomis raidėmis. Pasirink kitą.",
    invalidNicknameModerationTitle: "Netinkamas slapyvardis",
    invalidNicknameModerationBody: "Šis slapyvardis per daug įžeidžiantis. Pasirink kitą.",
    errorTitle: "Klaida",

    title: "Sveiki :)",
    subtitle: "Laiškelis yra galimybė pasakyti kažką asmeniško, kažkam, ko (gal) niekada nesutiksi.",

    nicknameLabel: "Pasirink slapyvardį",
    nicknamePlaceholder: "pvz. rasytojas67",
    nicknameHint: "Tai vienintelis vardas kurį matys kiti - tikro nereikia.",

    avatarLabel: "Pasirink avatarą",

    ageConfirmLabel: "Patvirtinu, jog esu pilnametis.",
    termsPrefix: "Sutinku su",
    termsLink: "naudojimo sąlygomis",
    termsMiddle: "ir",
    privacyLink: "privatumo politika",

    finish: "Baigiau",
  },
  en: {
    missingNicknameTitle: "Missing nickname",
    missingNicknameBody: "Enter a nickname of at least 2 characters.",
    missingAgeTitle: "Missing confirmation",
    missingAgeBody: "Confirm that you're an adult.",
    missingTermsTitle: "Missing agreement",
    missingTermsBody: "Agree to the terms of service and privacy policy.",

    nicknameTakenTitle: "Nickname taken",
    nicknameTakenBody: "Try another one.",
    invalidNicknameScriptTitle: "Invalid nickname",
    invalidNicknameScriptBody: "Nicknames can only use Latin letters. Pick another one.",
    invalidNicknameModerationTitle: "Invalid nickname",
    invalidNicknameModerationBody: "This nickname is too offensive. Pick another one.",
    errorTitle: "Error",

    title: "Hi :)",
    subtitle: "Laiškelis is a chance to say something personal to someone you (maybe) will never meet.",

    nicknameLabel: "Choose a nickname",
    nicknamePlaceholder: "e.g. writer67",
    nicknameHint: "This is the only name others will see — no real name needed.",

    avatarLabel: "Choose an avatar",

    ageConfirmLabel: "I confirm that I'm an adult.",
    termsPrefix: "I agree to the",
    termsLink: "terms of service",
    termsMiddle: "and",
    privacyLink: "privacy policy",

    finish: "Done",
  },
});
