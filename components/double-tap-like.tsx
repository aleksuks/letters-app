import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAccessibility } from "@/contexts/accessibility";
import { useTheme } from "@/contexts/theme";

const HEART_SIZE = 84;
const BURST_MS = 550;

interface Burst {
  id: number;
  x: number;
  y: number;
}

interface DoubleTapLikeProps {
  /** Fired once per double-tap. Idempotency is the caller's concern. */
  onLike: () => void;
  /** When true the gesture is ignored entirely (e.g. own letter). */
  disabled?: boolean;
  style?: ViewStyle;
  children: ReactNode;
}

/**
 * Wraps content in an Instagram-style double-tap-to-like: a big heart pops
 * exactly where the finger landed, with a haptic thump. The heart always
 * plays, even when the like was already given — re-affirming is part of the
 * gesture's charm, and the server call underneath is idempotent.
 *
 * A plain double-tap detector, not Exclusive-composed: single taps on
 * children (buttons, etc.) pass through untouched.
 */
export function DoubleTapLike({ onLike, disabled, style, children }: DoubleTapLikeProps) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(0);

  const fire = useCallback(
    (x: number, y: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setBursts((prev) => [...prev, { id: nextId.current++, x, y }]);
      onLike();
    },
    [onLike]
  );

  const removeBurst = useCallback((id: number) => {
    setBursts((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const tap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(320)
    .enabled(!disabled)
    .onEnd((e, success) => {
      if (success) runOnJS(fire)(e.x, e.y);
    });

  return (
    <GestureDetector gesture={tap}>
      <View style={style}>
        {children}
        {bursts.map((b) => (
          <HeartBurst key={b.id} x={b.x} y={b.y} onDone={() => removeBurst(b.id)} />
        ))}
      </View>
    </GestureDetector>
  );
}

function HeartBurst({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibility();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rise = useSharedValue(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (reducedMotion) {
      scale.value = 1;
      opacity.value = withDelay(300, withTiming(0, { duration: 180 }));
    } else {
      scale.value = withSpring(1, { damping: 14, stiffness: 380 });
      rise.value = withDelay(200, withTiming(-28, { duration: 320, easing: Easing.out(Easing.quad) }));
      opacity.value = withDelay(220, withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }));
    }
    const t = setTimeout(() => onDoneRef.current(), BURST_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: rise.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.heart,
        { left: x - HEART_SIZE / 2, top: y - HEART_SIZE / 2 },
        animatedStyle,
      ]}
    >
      <Ionicons name="heart" size={HEART_SIZE} color={colors.accent} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heart: {
    position: "absolute",
    width: HEART_SIZE,
    height: HEART_SIZE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
