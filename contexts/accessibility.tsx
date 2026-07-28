import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "a11y.reducedMotionOverride";
const TOUCH_TARGET_STORAGE_KEY = "a11y.largeTouchTargets";

// "system" defers to the OS Reduce Motion setting; "on"/"off" force it
// regardless of the OS, since not every user who wants calmer animations
// has found (or can find) that setting on their device.
type ReducedMotionOverride = "system" | "on" | "off";

// Bumps hitSlop/padding on tappable elements toward the 44pt minimum.
// Off by default — most of the app's icon buttons and chip-style buttons
// are intentionally compact, and inflating every target by default would
// change the look of the whole UI for users who never asked for it.
export const HIT_SLOP_LARGE = { top: 16, bottom: 16, left: 16, right: 16 };

// hitSlop grows only the *invisible* touch area, so on its own the setting
// reads as broken: you turn on "bigger buttons" and every button looks
// exactly the same size. Someone who needs a larger target usually needs to
// see it as well as hit it — an unchanged button says "this did nothing"
// regardless of what the touch handler now accepts. These give the setting a
// visible effect, and are shared rather than re-declared per screen so the
// enlargement is the same everywhere instead of drifting between 14pt here
// and 17pt there (which is roughly what it had drifted into).
//
// minHeight rather than padding alone: padding is measured from whatever the
// base style happens to be, so a +6pt bump on a compact button and on a roomy
// one produce visibly different results. A floor produces the same one.
export const LARGE_BUTTON = {
  minHeight: 56,
  paddingVertical: 16,
  paddingHorizontal: 22,
} as const;

// Icon-only buttons have no label to grow with them, so they get a square
// floor instead of vertical padding.
export const LARGE_ICON_BUTTON = { minWidth: 52, minHeight: 52 } as const;

// Applied alongside LARGE_BUTTON on the button's label. Bumping the target
// without bumping the text leaves a small word marooned in a big rectangle,
// which looks like a layout bug rather than an accommodation.
export const LARGE_BUTTON_TEXT = { fontSize: 18 } as const;

interface AccessibilityContextType {
  reducedMotion: boolean;
  reducedMotionOverride: ReducedMotionOverride;
  setReducedMotionOverride: (value: ReducedMotionOverride) => void;
  largeTouchTargets: boolean;
  setLargeTouchTargets: (value: boolean) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType>({
  reducedMotion: false,
  reducedMotionOverride: "system",
  setReducedMotionOverride: () => {},
  largeTouchTargets: false,
  setLargeTouchTargets: () => {},
});

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [override, setOverrideState] = useState<ReducedMotionOverride>("system");
  const [largeTouchTargets, setLargeTouchTargetsState] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReducedMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setSystemReducedMotion
    );
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === "on" || value === "off") setOverrideState(value);
    });
    AsyncStorage.getItem(TOUCH_TARGET_STORAGE_KEY).then((value) => {
      if (value === "on") setLargeTouchTargetsState(true);
    });
    return () => subscription.remove();
  }, []);

  function setReducedMotionOverride(value: ReducedMotionOverride) {
    setOverrideState(value);
    AsyncStorage.setItem(STORAGE_KEY, value);
  }

  function setLargeTouchTargets(value: boolean) {
    setLargeTouchTargetsState(value);
    AsyncStorage.setItem(TOUCH_TARGET_STORAGE_KEY, value ? "on" : "off");
  }

  const reducedMotion =
    override === "system" ? systemReducedMotion : override === "on";

  return (
    <AccessibilityContext.Provider
      value={{
        reducedMotion,
        reducedMotionOverride: override,
        setReducedMotionOverride,
        largeTouchTargets,
        setLargeTouchTargets,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  return useContext(AccessibilityContext);
}
