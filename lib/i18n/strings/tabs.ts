import { defineStrings } from "@/lib/i18n";

// Shared by app/(tabs)/_layout.tsx (tab titles) and components/tab-bar.tsx
// (tab bar labels read from those same titles).
export const tabsStrings = defineStrings({
  lt: {
    obituary: "Kapinės",
    letters: "Laiškeliai",
    map: "Žemėlapis",
    conversations: "Pokalbiai",
    profile: "Profilis",
  },
  en: {
    obituary: "Obituary",
    letters: "Letters",
    map: "Map",
    conversations: "Messages",
    profile: "Profile",
  },
});
