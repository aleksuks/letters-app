import { defineStrings } from "@/lib/i18n";

// app/(tabs)/profile.tsx — the profile tab.
export const profileStrings = defineStrings({
  lt: {
    title: "Profilis",
    changeAvatarLabel: "Keisti avatarą",

    settingsLabel: "Nustatymai",
    moderateLabel: "Moderuoti",
    signOutLabel: "Atsijungti",

    signOutConfirmTitle: "Atsijungti",
    signOutConfirmBody: "Ar tikrai norite atsijungti? Gal ne?",
  },
  en: {
    title: "Profile",
    changeAvatarLabel: "Change avatar",

    settingsLabel: "Settings",
    moderateLabel: "Moderate",
    signOutLabel: "Sign out",

    signOutConfirmTitle: "Sign out",
    signOutConfirmBody: "Are you sure you want to sign out? Maybe not?",
  },
});
