import { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef } from "react";
import { useWindowDimensions } from "react-native";
import {
  Easing,
  runOnJS,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AnimatedTabBar } from "@/components/tab-bar";
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
      blurIntensity.value = withSequence(
        withTiming(TAB_TRANSITION_BLUR, {
          duration: TAB_TRANSITION_DURATION * 0.35,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(0, {
          duration: TAB_TRANSITION_DURATION * 0.65,
          easing: Easing.out(Easing.quad),
        })
      );
      position.value = withTiming(
        index,
        {
          duration: TAB_TRANSITION_DURATION,
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
    [position, blurIntensity, notify, finishTransition]
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
      <Tabs
        detachInactiveScreens={false}
        screenOptions={screenOptions}
        tabBar={(props) => <AnimatedTabBar {...props} />}
        screenListeners={{
          state: (e) => {
            animateToIndex(e.data.state.index);
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Kapinės",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="book-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: "Laiškeliai",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="mail-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="conversations"
          options={{
            title: "Pokalbiai",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profilis",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      </TabSceneVisibilityOverride>
    </TabPagerContext.Provider>
  );
}
