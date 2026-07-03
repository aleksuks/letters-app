import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments, useNavigationContainerRef } from "expo-router";
import { CommonActions } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import { ThemeProvider } from "@/contexts/theme";
import { AccessibilityProvider } from "@/contexts/accessibility";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();
  const navRef = useNavigationContainerRef();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

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
      <AccessibilityProvider>
        <ThemeProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="accessibility" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="write" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="receive" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="chat/[id]" options={{ animation: "slide_from_right" }} />
          </Stack>
        </ThemeProvider>
      </AccessibilityProvider>
    </GestureHandlerRootView>
  );
}
