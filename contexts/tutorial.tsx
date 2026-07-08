import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "letters.tutorial.seen";

interface TutorialContextType {
  isSeen: (id: string) => boolean;
  markSeen: (id: string) => void;
  resetAll: () => void;
}

const TutorialContext = createContext<TutorialContextType>({
  isSeen: () => true,
  markSeen: () => {},
  resetAll: () => {},
});

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  // Until storage resolves, isSeen() reports true for everything — otherwise
  // a tip already dismissed in a previous session would flash on screen for
  // a frame before disappearing again.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setSeen(new Set(JSON.parse(raw)));
        } catch {
          // Corrupt storage — treat as nothing seen yet.
        }
      }
      setLoaded(true);
    });
  }, []);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setSeen(new Set());
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const isSeen = useCallback(
    (id: string) => !loaded || seen.has(id),
    [loaded, seen]
  );

  return (
    <TutorialContext.Provider value={{ isSeen, markSeen, resetAll }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  return useContext(TutorialContext);
}
