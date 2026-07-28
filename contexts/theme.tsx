import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  subtext: string;
  accent: string;
  accentText: string;
  border: string;
  red: string;
  tabBar: string;
  tabBarBorder: string;
  tabActive: string;
  tabInactive: string;
  switchTrackOff: string;
}

// Contrast note (audited 2026-07-28 against WCAG 2.1 AA, every foreground
// against every surface it actually lands on — bg, surface and surfaceAlt):
//
//   - `text`, `accent`, `accentText` and `red` were already well clear of
//     4.5:1 and are untouched.
//   - `subtext` was #8A7F6F, which is 2.83:1 on `bg`. It carries real content
//     (timestamps, counts, letter status, most of the metadata in the app),
//     so it needs body-text contrast, not decorative contrast. Darkened along
//     lightness only — same hue and saturation, so the warm-paper cast is
//     unchanged — to the lightest value that clears 4.5:1 on the *worst* of
//     the three surfaces (4.66:1 on bg, 6.05:1 on surfaceAlt).
//   - `tabInactive` was #A89F8F, 2.25:1: an unselected tab is not a disabled
//     control, it is a live navigation target with a small text label, so it
//     gets the same 4.5:1 bar.
//   - `switchTrackOff` was #ccc, 1.38:1 and a cold grey in a warm palette. It
//     encodes a control's state, so it needs the 3:1 non-text bar; reusing
//     the retired subtext tone gives 3.37:1 and stays in the palette.
//
// `border` and `tabBarBorder` remain deliberately low-contrast (1.38:1 and
// 1.13:1). WCAG 1.4.11 asks for 3:1 only where a boundary is *needed* to
// identify a control; these are decorative rules between paper surfaces, and
// every control they sit near is already identifiable by its label and its
// own contrast. Raising them turns the paper into a wireframe, which is what
// the high-contrast palette is for — it takes them to 3.37:1.
const COLORS: ThemeColors = {
  bg: "#E3DAC9",
  surface: "#F3EDE1",
  surfaceAlt: "#FBF7F0",
  text: "#2B2320",
  subtext: "#665D51",
  accent: "#96150D",
  accentText: "#ffffff",
  border: "#D8CBB0",
  red: "#96150D",
  tabBar: "#F3EDE1",
  tabBarBorder: "#E5E0D5",
  tabActive: "#96150D",
  tabInactive: "#726959",
  switchTrackOff: "#8A7F6F",
};

// Contrast-boosted palette. Every paper surface goes white: the bone
// background is the single biggest limit on this palette, because it is the
// darkest thing anything is ever drawn on, so every foreground had to clear
// its bar against bone rather than against the near-white card and letter
// surfaces. Dropping it to #FFFFFF lifts the whole palette at once — the
// worst pair in the mode goes from 7.27:1 to 10.09:1 — and it is the honest
// trade for this mode: the warm paper is the product's identity, but someone
// who has switched high contrast on has said they would rather read the text.
//
// Because all three surfaces are now the same white, tonal separation between
// page and card is gone and `border` is the only thing left describing where
// a card ends. It is therefore darker here than the 3:1 minimum needs
// (5.99:1) — in the one mode whose entire purpose is legibility, a card edge
// should not be a hairline you have to hunt for.
//
// `switchTrackOff` deliberately stays lighter (3.93:1, clears the 3:1 non-text
// bar) rather than matching the border. The "on" state is `accent`, a dark
// red; a dark warm-grey "off" track would read as another dark pill and make
// the two states tell apart by hue alone.
const HIGH_CONTRAST_COLORS: ThemeColors = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#FFFFFF",
  text: "#161210",
  subtext: "#4A4038",
  accent: "#6E0F09",
  accentText: "#ffffff",
  border: "#6B6255",
  red: "#6E0F09",
  tabBar: "#FFFFFF",
  tabBarBorder: "#6B6255",
  tabActive: "#6E0F09",
  tabInactive: "#4A4038",
  switchTrackOff: "#8A7F6F",
};

const STORAGE_KEY = "a11y.highContrast";

interface ThemeContextType {
  colors: ThemeColors;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: COLORS,
  highContrast: false,
  setHighContrast: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [highContrast, setHighContrastState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === "1") setHighContrastState(true);
    });
  }, []);

  function setHighContrast(value: boolean) {
    setHighContrastState(value);
    AsyncStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  }

  const colors = highContrast ? HIGH_CONTRAST_COLORS : COLORS;

  return (
    <ThemeContext.Provider value={{ colors, highContrast, setHighContrast }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
