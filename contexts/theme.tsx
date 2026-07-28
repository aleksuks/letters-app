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

// Contrast-boosted palette: darker text/subtext and stronger borders against
// the same warm background, aimed at WCAG AA body-text contrast (>=4.5:1).
const HIGH_CONTRAST_COLORS: ThemeColors = {
  bg: "#E3DAC9",
  surface: "#F3EDE1",
  surfaceAlt: "#FBF7F0",
  text: "#161210",
  subtext: "#4A4038",
  accent: "#6E0F09",
  accentText: "#ffffff",
  border: "#8A7F6F",
  red: "#6E0F09",
  tabBar: "#F3EDE1",
  tabBarBorder: "#8A7F6F",
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
