import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Stack, useRouter, useSegments, useNavigationContainerRef } from "expo-router";
import { CommonActions } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import { ThemeProvider } from "@/contexts/theme";
import { AccessibilityProvider } from "@/contexts/accessibility";
import { TutorialProvider } from "@/contexts/tutorial";
import { UnreadMessagesProvider } from "@/contexts/unread-messages";
import { registerForPushNotificationsAsync, touchLastActive, notificationDataToRoute } from "@/lib/notifications";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();
  const navRef = useNavigationContainerRef();

  // Kicked off here (rather than lazily inside EnvelopeLetter) so it's
  // already cached by the time the write/receive ceremony ever mounts —
  // loading it there instead meant the very first ceremony of a session
  // could re-render mid-animation the moment the font resolved, landing as
  // a stutter right as the letter's text became visible.
  useFonts({ SpecialElite: require("@/assets/fonts/SpecialElite-Regular.ttf") });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Push token registration + activity heartbeat (powers the inactivity
  // reminder's eligibility check). Runs on every session change, so both a
  // fresh sign-in and a restored session on relaunch pick it up.
  useEffect(() => {
    if (!session) return;
    registerForPushNotificationsAsync(session.user.id);
    touchLastActive(session.user.id);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") touchLastActive(session.user.id);
    });
    return () => subscription.remove();
  }, [session]);

  // Tapping a push notification deep-links to whatever it's about.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = notificationDataToRoute(
        response.notification.request.content.data as Record<string, unknown>
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (route) router.push(route as any);
    });
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (session === undefined) return;

    const seg0 = segments[0] as string;
    const inAuthGroup = seg0 === "(auth)";
    const inOnboarding = seg0 === "onboarding";
    const inTabs = seg0 === "(tabs)";
    const onIndex = !seg0; // root index — let index.tsx handle its own redirect

    if (onIndex) return;

    if (!session && !inAuthGroup) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(auth)/sign-in" as any);
      return;
    }

    if (session && inAuthGroup) {
      supabase
        .from("user_profiles")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.replace("/onboarding" as any);
          } else {
            navRef.dispatch(
              CommonActions.reset({ index: 0, routes: [{ name: "(tabs)" }] })
            );
          }
        });
    }
  }, [session, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AccessibilityProvider>
          <ThemeProvider>
            <TutorialProvider>
              <UnreadMessagesProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="onboarding" />
                  <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
                  <Stack.Screen name="blocked-users" options={{ animation: "slide_from_right" }} />
                  <Stack.Screen name="accessibility" options={{ animation: "slide_from_right" }} />
                  <Stack.Screen name="avatar-picker" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="write" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="receive" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="map-write" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="map-letter" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="chat/[id]" options={{ animation: "slide_from_right" }} />
                </Stack>
              </UnreadMessagesProvider>
            </TutorialProvider>
          </ThemeProvider>
        </AccessibilityProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
