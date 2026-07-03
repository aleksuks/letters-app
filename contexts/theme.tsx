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

const COLORS: ThemeColors = {
  bg: "#E3DAC9",
  surface: "#F3EDE1",
  surfaceAlt: "#FBF7F0",
  text: "#2B2320",
  subtext: "#8A7F6F",
  accent: "#96150D",
  accentText: "#ffffff",
  border: "#D8CBB0",
  red: "#96150D",
  tabBar: "#F3EDE1",
  tabBarBorder: "#E5E0D5",
  tabActive: "#96150D",
  tabInactive: "#A89F8F",
  switchTrackOff: "#ccc",
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
