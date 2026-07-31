import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "letters.tour.step";
// Deliberately NOT the legacy "welcome_letter" tutorial id: that one was
// already marked seen by the retired full-screen welcome overlay, so every
// install from before this rework would silently skip the premise letter and
// get a stranger's letter as its "first" one instead.
const WELCOME_KEY = "letters.tour.welcomeDelivered";

/**
 * The discovery tour: a sequence of spotlight steps anchored to real
 * controls, each dismissed by performing the action it points at (never by
 * reading and closing — that's the failure mode of the old banner tips).
 *
 *   lettersTab    → tap the Letters tab in the tab bar
 *   receiveButton → tap "Gauti laiškelį" (which delivers the welcome letter
 *                   as the guaranteed first delivery — see app/receive.tsx)
 *   mapTab        → tap the Map tab, meeting the second letter kind
 *   farewell      → a closing word once they've had a moment on the map, so
 *                   the tour ends rather than just stopping
 *
 * The current step is persisted, so the tour resumes across sessions and
 * never repeats a completed step. Existing installs start at the beginning
 * too — the tour doubles as feature discovery for users who found the map
 * but never the letter pool.
 */
export type TourStep =
  | "lettersTab"
  | "receiveButton"
  | "mapTab"
  | "farewell"
  | "done";

const NEXT_STEP: Record<Exclude<TourStep, "done">, TourStep> = {
  lettersTab: "receiveButton",
  receiveButton: "mapTab",
  mapTab: "farewell",
  farewell: "done",
};

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type MeasureFn = () => Promise<TargetRect | null>;

/** Shared helper for tour targets: window-coordinate rect of a mounted view. */
export function measureViewInWindow(view: View | null): Promise<TargetRect | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => {
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

interface TourContextType {
  /** null until storage resolves — render nothing rather than flashing a step. */
  step: TourStep | null;
  /**
   * Whether the premise letter has already been handed over. null while
   * storage resolves — callers must wait rather than treating unknown as
   * delivered, or the first receive races into the real pool.
   */
  welcomeDelivered: boolean | null;
  markWelcomeDelivered: () => void;
  /** Route name of the focused tab, kept current by the tabs layout. */
  focusedTab: string;
  onTabFocused: (routeName: string) => void;
  /** Advance only if `from` is the current step — safe to call unconditionally. */
  advanceFrom: (from: Exclude<TourStep, "done">) => void;
  skip: () => void;
  reset: () => void;
  registerTarget: (id: string, measure: MeasureFn) => () => void;
  measureTarget: (id: string) => Promise<TargetRect | null>;
}

const TourContext = createContext<TourContextType>({
  step: null,
  welcomeDelivered: null,
  markWelcomeDelivered: () => {},
  focusedTab: "index",
  onTabFocused: () => {},
  advanceFrom: () => {},
  skip: () => {},
  reset: () => {},
  registerTarget: () => () => {},
  measureTarget: async () => null,
});

function isTourStep(value: unknown): value is TourStep {
  return (
    value === "lettersTab" ||
    value === "receiveButton" ||
    value === "mapTab" ||
    value === "farewell" ||
    value === "done"
  );
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<TourStep | null>(null);
  const [welcomeDelivered, setWelcomeDelivered] = useState<boolean | null>(null);
  const [focusedTab, setFocusedTab] = useState("index");
  const targetsRef = useRef(new Map<string, MeasureFn>());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      setStep(isTourStep(raw) ? raw : "lettersTab");
    });
    AsyncStorage.getItem(WELCOME_KEY).then((raw) => {
      setWelcomeDelivered(raw === "1");
    });
  }, []);

  const markWelcomeDelivered = useCallback(() => {
    setWelcomeDelivered(true);
    AsyncStorage.setItem(WELCOME_KEY, "1");
  }, []);

  const setAndPersist = useCallback((next: TourStep) => {
    setStep(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const advanceFrom = useCallback(
    (from: Exclude<TourStep, "done">) => {
      setStep((current) => {
        if (current !== from) return current;
        const next = NEXT_STEP[from];
        AsyncStorage.setItem(STORAGE_KEY, next);
        return next;
      });
    },
    []
  );

  const onTabFocused = useCallback(
    (routeName: string) => {
      setFocusedTab(routeName);
      // Landing on the tab a step points at completes it, whether the user
      // tapped the spotlit tab item or found their own way there.
      if (routeName === "letters") advanceFrom("lettersTab");
      if (routeName === "map") advanceFrom("mapTab");
    },
    [advanceFrom]
  );

  const skip = useCallback(() => setAndPersist("done"), [setAndPersist]);

  const reset = useCallback(() => {
    setStep("lettersTab");
    setWelcomeDelivered(false);
    AsyncStorage.multiRemove([STORAGE_KEY, WELCOME_KEY]);
  }, []);

  const registerTarget = useCallback((id: string, measure: MeasureFn) => {
    targetsRef.current.set(id, measure);
    return () => {
      // Another instance may have re-registered the id in the meantime.
      if (targetsRef.current.get(id) === measure) targetsRef.current.delete(id);
    };
  }, []);

  const measureTarget = useCallback(async (id: string) => {
    const measure = targetsRef.current.get(id);
    return measure ? measure() : null;
  }, []);

  return (
    <TourContext.Provider
      value={{
        step,
        welcomeDelivered,
        markWelcomeDelivered,
        focusedTab,
        onTabFocused,
        advanceFrom,
        skip,
        reset,
        registerTarget,
        measureTarget,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  return useContext(TourContext);
}
