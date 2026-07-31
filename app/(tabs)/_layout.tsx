import { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef } from "react";
import { useWindowDimensions, View } from "react-native";
import {
  Easing,
  runOnJS,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AnimatedTabBar } from "@/components/tab-bar";
import { TourSpotlight } from "@/components/tour-spotlight";
import { useAccessibility } from "@/contexts/accessibility";
import { useTour } from "@/contexts/tour";
import { useStrings } from "@/lib/i18n";
import { tabsStrings } from "@/lib/i18n/strings/tabs";
import {
  TAB_TRANSITION_BLUR,
  TAB_TRANSITION_DURATION,
  TabPagerContext,
  TabSceneVisibilityOverride,
  type TabPagerValue,
  type TabTransitionPhase,
} from "@/components/tab-pager";

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const { reducedMotion } = useAccessibility();
  const { onTabFocused } = useTour();
  const t = useStrings(tabsStrings);

  const position = useSharedValue(0);
  const blurIntensity = useSharedValue(0);
  const transitioningRef = useRef(false);
  const listenersRef = useRef(
    new Set<(phase: TabTransitionPhase) => void>()
  );

  const notify = useCallback((phase: TabTransitionPhase) => {
    listenersRef.current.forEach((listener) => listener(phase));
  }, []);

  const finishTransition = useCallback(() => {
    transitioningRef.current = false;
    notify("end");
  }, [notify]);

  const animateToIndex = useCallback(
    (index: number) => {
      if (!transitioningRef.current && position.value === index) {
        return;
      }
      transitioningRef.current = true;
      notify("start");
      const duration = reducedMotion ? 1 : TAB_TRANSITION_DURATION;
      // Reduced motion drops the blur pulse entirely rather than shrinking
      // it — a near-instant blur flash still reads as motion.
      blurIntensity.value = reducedMotion
        ? 0
        : withSequence(
            withTiming(TAB_TRANSITION_BLUR, {
              duration: duration * 0.35,
              easing: Easing.out(Easing.quad),
            }),
            withTiming(0, {
              duration: duration * 0.65,
              easing: Easing.out(Easing.quad),
            })
          );
      position.value = withTiming(
        index,
        {
          duration,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          // An interrupted slide is picked up by the next animateToIndex call.
          if (finished) {
            runOnJS(finishTransition)();
          }
        }
      );
    },
    [position, blurIntensity, notify, finishTransition, reducedMotion]
  );

  const pager = useMemo<TabPagerValue>(
    () => ({
      position,
      blurIntensity,
      width,
      isTransitioning: () => transitioningRef.current,
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    }),
    [position, blurIntensity, width]
  );

  const screenOptions: BottomTabNavigationOptions = {
    headerShown: false,
    // All tabs stay mounted and attached so every screen can render while
    // flying past during a multi-tab jump; TabPage translates each one to
    // its slot on the strip, so the scene containers themselves must be
    // transparent to not paint over the neighbours.
    lazy: false,
    sceneStyle: { backgroundColor: "transparent" },
  };

  return (
    <TabPagerContext.Provider value={pager}>
      <TabSceneVisibilityOverride>
      {/* The spotlight must overlay the tab bar too, so it sits as a
          sibling of the whole navigator rather than inside any screen. */}
      <View style={{ flex: 1 }}>
      <Tabs
        detachInactiveScreens={false}
        screenOptions={screenOptions}
        tabBar={(props) => <AnimatedTabBar {...props} />}
        screenListeners={{
          state: (e) => {
            animateToIndex(e.data.state.index);
            // Keeps the discovery tour told which tab is on screen — both
            // to advance tab-targeted steps and to hide steps whose target
            // lives on a currently off-screen tab.
            const route = e.data.state.routes[e.data.state.index];
            if (route) onTabFocused(route.name);
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t.obituary,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="book-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="letters"
          options={{
            title: t.letters,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="mail-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: t.map,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="map-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="conversations"
          options={{
            title: t.conversations,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t.profile,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      <TourSpotlight />
      </View>
      </TabSceneVisibilityOverride>
    </TabPagerContext.Provider>
  );
}
