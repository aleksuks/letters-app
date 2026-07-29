import { defineStrings } from "@/lib/i18n";

export const settingsStrings = defineStrings({
  lt: {
    title: "Nustatymai",
    goBack: "Grįžti atgal",

    languageSectionTitle: "Kalba",
    languageLt: "Lietuvių",
    languageEn: "English",

    connectionsSectionTitle: "Užklausos susisiekti",
    acceptRequestsLabel: "Leisti užklausas pokalbiams",
    acceptRequestsDesc: "Leisti laiškelių gavėjams siųsti užklausas pokalbiams",

    privacySectionTitle: "Privatumas",
    blockedUsersLabel: "Blokuoti vartotojai",
    blockedUsersDesc: "Peržiūrėk ir atblokuok užblokuotus žmones",

    notificationsSectionTitle: "Pranešimai",
    activityNotificationsLabel: "Laiškelio kelionė",
    activityNotificationsDesc: "Pranešimai apie patiktukus, laiškelio pabaigą ir patekimą į „Kapinių“ skiltį",
    remindersLabel: "Priminti apie naujus laiškelius",
    remindersDesc: "Retas, švelnus priminimas — tik jei tikrai yra laiškelis, kurį gali gauti",

    helpSectionTitle: "Pagalba",
    resetTutorialLabel: "Rodyti patarimus iš naujo",
    resetTutorialDesc: "Grąžina visus paaiškinimus, kuriuos jau uždarei",
    resetTutorialDoneTitle: "Gerai",
    resetTutorialDoneBody: "Patarimai vėl pasirodys, kai atidarysi atitinkamus ekranus.",

    accessibilitySectionTitle: "Pritaikymas",
    accessibilityLabel: "Pritaikymas neįgaliesiems",
    accessibilityDesc: "Animacijos, kontrastas",

    accountSectionTitle: "Paskyra",
    privacyPolicyLabel: "Privatumo politika",
    termsLabel: "Naudojimo sąlygos",
    versionLabel: "Laiškelio versija",
    deleteAccountLabel: "Ištrinti paskyrą",
    deleteAccountDeleting: "Trinama...",
    deleteAccountDesc: "Visam laikui ištrina paskyrą, laiškelius, pokalbius ir žinutes",

    deleteConfirmTitle: "Ištrinti paskyrą?",
    deleteConfirmBody: "Šis veiksmas negrįžtamas. Bus visam laikui ištrinta Jūsų paskyra, laiškeliai, pokalbiai ir žinutės.",
    deleteConfirmCancel: "Atšaukti",
    deleteConfirmContinue: "Tęsti",
    deleteFinalTitle: "Ar tikrai?",
    deleteFinalBody: "Paskutinis patvirtinimas — šio veiksmo atšaukti nebus galima.",
    deleteFinalCancel: "Atšaukti",
    deleteFinalConfirm: "Ištrinti paskyrą",

    errorTitle: "Klaida",
  },
  en: {
    title: "Settings",
    goBack: "Go back",

    languageSectionTitle: "Language",
    languageLt: "Lietuvių",
    languageEn: "English",

    connectionsSectionTitle: "Connection requests",
    acceptRequestsLabel: "Allow requests to talk",
    acceptRequestsDesc: "Let letter recipients send you requests to talk",

    privacySectionTitle: "Privacy",
    blockedUsersLabel: "Blocked users",
    blockedUsersDesc: "Review and unblock people you've blocked",

    notificationsSectionTitle: "Notifications",
    activityNotificationsLabel: "Letter journey",
    activityNotificationsDesc: "Notifications about likes, a letter's end, and placement in the “Obituary”",
    remindersLabel: "Remind me about new letters",
    remindersDesc: "A rare, gentle nudge — only when there's actually a letter you can receive",

    helpSectionTitle: "Help",
    resetTutorialLabel: "Show tips again",
    resetTutorialDesc: "Brings back every hint you've already dismissed",
    resetTutorialDoneTitle: "Done",
    resetTutorialDoneBody: "Tips will reappear as you open the relevant screens.",

    accessibilitySectionTitle: "Accessibility",
    accessibilityLabel: "Accessibility",
    accessibilityDesc: "Animations, contrast",

    accountSectionTitle: "Account",
    privacyPolicyLabel: "Privacy policy",
    termsLabel: "Terms of service",
    versionLabel: "Laiškelis version",
    deleteAccountLabel: "Delete account",
    deleteAccountDeleting: "Deleting...",
    deleteAccountDesc: "Permanently deletes your account, letters, conversations, and messages",

    deleteConfirmTitle: "Delete account?",
    deleteConfirmBody: "This can't be undone. Your account, letters, conversations, and messages will be permanently deleted.",
    deleteConfirmCancel: "Cancel",
    deleteConfirmContinue: "Continue",
    deleteFinalTitle: "Are you sure?",
    deleteFinalBody: "Last confirmation — this action can't be undone.",
    deleteFinalCancel: "Cancel",
    deleteFinalConfirm: "Delete account",

    errorTitle: "Error",
  },
});
