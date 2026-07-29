import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Lang = "lt" | "en";

const STORAGE_KEY = "settings.language";

interface LanguageContextType {
  lang: Lang;
  setLang: (value: Lang) => void;
}

// Defaults to "lt" regardless of device locale — the product is built for a
// Lithuanian audience first (see CLAUDE.md), English is an opt-in for
// reviewers and out-of-market readers rather than something detected.
const LanguageContext = createContext<LanguageContextType>({
  lang: "lt",
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("lt");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === "en" || value === "lt") setLangState(value);
    });
  }, []);

  function setLang(value: Lang) {
    setLangState(value);
    AsyncStorage.setItem(STORAGE_KEY, value);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
