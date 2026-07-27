import { useEffect } from "react";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useAccessibility } from "@/contexts/accessibility";

/**
 * A letter still in flight — the living counterpart to the 🪦 that marks a
 * dead one. It drifts on a slow sine loop (bob, sway, and a slight tilt off
 * the vertical) so a glance at "My Letters" distinguishes travelling letters
 * from buried ones without reading a word.
 *
 * The loop is deliberately long and small-amplitude: this sits inside a list
 * row, and anything faster reads as a notification badge demanding attention
 * rather than a letter quietly making its way somewhere.
 */
export function FlyingLetter({ size = 18 }: { size?: number }) {
  const { reducedMotion } = useAccessibility();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      t.value = 0.5;
      return;
    }
    t.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [reducedMotion, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [2, -3]) },
      { translateX: interpolate(t.value, [0, 1], [-1.5, 1.5]) },
      { rotate: `${interpolate(t.value, [0, 1], [-7, 7])}deg` },
    ],
  }));

  return (
    <Animated.Text style={[{ fontSize: size, lineHeight: size * 1.4 }, style]}>
      ✉️
    </Animated.Text>
  );
}
