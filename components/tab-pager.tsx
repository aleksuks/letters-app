import { useNavigationState, useRoute } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import {
  createContext,
  forwardRef,
  use,
  type ContextType,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenContext, type ScreenProps } from "react-native-screens";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

export const TAB_TRANSITION_DURATION = 380;
/** Peak expo-blur intensity (0–100) mid-slide. */
export const TAB_TRANSITION_BLUR = 2;

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export type TabTransitionPhase = "start" | "end";

export type TabPagerValue = {
  /** Animated tab position: an index while at rest, fractional mid-slide. */
  position: SharedValue<number>;
  /** Blur overlay intensity: 0 at rest, ramps to a peak mid-slide. */
  blurIntensity: SharedValue<number>;
  /** Viewport width, the distance between adjacent tab slots. */
  width: number;
  /** Whether a slide is currently in flight. */
  isTransitioning: () => boolean;
  subscribe: (listener: (phase: TabTransitionPhase) => void) => () => void;
};

export const TabPagerContext = createContext<TabPagerValue | null>(null);

/**
 * react-navigation hides blurred tab scenes with display:none through
 * react-native-screens — even with detachInactiveScreens={false}, the RNS
 * <Screen> fallback branch still applies it based on activityState. The
 * pager needs every scene to stay drawable so tabs can fly past mid-slide,
 * so within this subtree scenes render as plain always-visible views;
 * off-screen tabs are "hidden" by TabPage translating them out of the
 * viewport instead. Must wrap the <Tabs> navigator in the tab layout.
 */
const AlwaysVisibleScene = forwardRef<View, ScreenProps>(
  (
    // Strip the screen-management props RNS/react-navigation pass down;
    // what remains (style, pointerEvents, children) belongs on a View.
    { active, activityState, enabled, freezeOnBlur, shouldFreeze, ...rest },
    ref
  ) => <View ref={ref} {...rest} />
);

AlwaysVisibleScene.displayName = "AlwaysVisibleScene";

export function TabSceneVisibilityOverride({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ScreenContext.Provider
      value={AlwaysVisibleScene as ContextType<typeof ScreenContext>}
    >
      {children}
    </ScreenContext.Provider>
  );
}

export function useTabPager(): TabPagerValue {
  const pager = use(TabPagerContext);
  if (!pager) {
    throw new Error("useTabPager must be used inside the tab layout");
  }
  return pager;
}

/**
 * Root container for a tab screen: lays it out on a horizontal strip by
 * offsetting it from the shared `position` by its own tab index. While
 * `position` animates between two distant indexes, the screens in between
 * slide through the viewport — the fly-by. Requires the tab navigator to
 * keep all scenes attached (lazy: false, detachInactiveScreens: false,
 * transparent sceneStyle).
 *
 * `style` must include an opaque backgroundColor so neighbouring tabs
 * can't show through mid-slide.
 */
export function TabPage({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { position, blurIntensity, width } = useTabPager();
  const route = useRoute();
  const index = useNavigationState((state) =>
    state.routes.findIndex((r) => r.key === route.key)
  );

  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: (index - position.value) * width }],
    }),
    [index, width]
  );

  const blurProps = useAnimatedProps(() => ({
    intensity: blurIntensity.value,
  }));

  return (
    <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>
      {/* Bottom is deliberately excluded: the tab bar (components/tab-bar.tsx)
          already reserves the bottom inset itself, and the screen container
          ends exactly where the tab bar begins — adding it here too would
          double the gap above the tab bar. */}
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {children}
      </SafeAreaView>
      {/* Motion blur while sliding. The overlay translates with the page,
          so the four page overlays tile the viewport seamlessly. On Android
          expo-blur falls back to a subtle translucent tint. */}
      <AnimatedBlurView
        animatedProps={blurProps}
        tint="default"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </Animated.View>
  );
}
