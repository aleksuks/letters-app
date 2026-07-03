import { createContext, useContext, ReactNode } from "react";

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

interface ThemeContextType {
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({ colors: COLORS });

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ colors: COLORS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
