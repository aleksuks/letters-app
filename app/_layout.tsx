import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Linking from "expo-linking";
import { Stack, useRouter, useSegments, useNavigationContainerRef } from "expo-router";
import { CommonActions } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import { ThemeProvider } from "@/contexts/theme";
import { LanguageProvider } from "@/contexts/language";
import { AccessibilityProvider } from "@/contexts/accessibility";
import { TutorialProvider } from "@/contexts/tutorial";
import { TourProvider } from "@/contexts/tour";
import { UnreadMessagesProvider } from "@/contexts/unread-messages";
import { ProfileProvider } from "@/contexts/profile";
import { registerForPushNotificationsAsync, touchLastActive, notificationDataToRoute } from "@/lib/notifications";

// The envelope ceremony (components/envelope-letter.tsx) races a Tap and a
// Pan gesture at every swipeable stage. Resolving that race sometimes has
// Gesture Handler call into Reanimated's setGestureState from the plain JS
// thread instead of the UI runtime — internal library plumbing, nothing our
// gesture callbacks do directly — which Reanimated then logs as a warning
// on every occurrence. It doesn't affect gesture behavior; raising the
// logger's floor above `warn` is the documented way to quiet it.
if (__DEV__) {
  configureReanimatedLogger({ level: ReanimatedLogLevel.error });
}

// Password-recovery links carry tokens as a URL fragment (implicit flow,
// the supabase-js default — detectSessionInUrl is off in lib/supabase.ts
// since that only works in a browser, so this app parses the fragment by
// hand instead). Manual split/decode rather than URLSearchParams, which
// isn't used or confirmed-polyfilled anywhere else in this codebase.
function parseRecoveryTokens(url: string): { access_token: string; refresh_token: string } | null {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return null;
  const params: Record<string, string> = {};
  for (const pair of url.slice(hashIndex + 1).split("&")) {
    const [key, value] = pair.split("=");
    if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  if (params.type !== "recovery" || !params.access_token || !params.refresh_token) return null;
  return { access_token: params.access_token, refresh_token: params.refresh_token };
}

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

  // A tapped recovery-email link opens the app via laiskelis://auth/reset-
  // password#access_token=...&type=recovery. setSession() establishes that
  // as a real (if temporary) session, which is enough for updatePassword()
  // on the reset screen — no separate "recovery mode" flag needed, since the
  // session-routing effect below is taught to leave the reset screen alone.
  useEffect(() => {
    function handleUrl(url: string) {
      const tokens = parseRecoveryTokens(url);
      if (!tokens) return;
      supabase.auth.setSession(tokens).then(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace("/(auth)/reset-password" as any);
      });
    }

    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); });
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [router]);

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

    // The reset-password screen is reached with a valid session (the
    // recovery token IS a session) but must not be bounced straight into
    // the tabs before the user has actually set a new password.
    if (session && inAuthGroup && segments[1] !== "reset-password") {
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
            <LanguageProvider>
              <TutorialProvider>
                <TourProvider>
                <ProfileProvider>
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
                      <Stack.Screen name="letter-grave" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                      <Stack.Screen name="letter-flight" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                      <Stack.Screen name="chat/[id]" options={{ animation: "slide_from_right" }} />
                    </Stack>
                  </UnreadMessagesProvider>
                </ProfileProvider>
                </TourProvider>
              </TutorialProvider>
            </LanguageProvider>
          </ThemeProvider>
        </AccessibilityProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
