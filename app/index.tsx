import { useEffect, useState } from "react";
import { useRouter, useNavigationContainerRef } from "expo-router";
import { CommonActions } from "@react-navigation/native";
import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import { AnimatedSplash } from "@/components/animated-splash";

type Phase = "loading" | "unauthenticated" | "needs_onboarding" | "ready";

const MIN_SPLASH_MS = 2000;

export default function Index() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [minDurationElapsed, setMinDurationElapsed] = useState(false);
  const router = useRouter();
  const navRef = useNavigationContainerRef();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => resolve(session));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setMinDurationElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  async function resolve(session: Session | null) {
    if (!session) { setPhase("unauthenticated"); return; }
    const { data } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", session.user.id)
      .maybeSingle();
    setPhase(data ? "ready" : "needs_onboarding");
  }

  useEffect(() => {
    if (phase === "loading" || !minDurationElapsed) return;
    if (phase === "unauthenticated") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(auth)/sign-in" as any);
    } else if (phase === "needs_onboarding") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/onboarding" as any);
    } else {
      // router.replace("/(tabs)/index") fails because app/index.tsx and
      // (tabs)/index.tsx share the same effective URL (/), so expo-router's
      // getStateFromPath can't resolve it. Reset the root stack by route name
      // directly to avoid the URL ambiguity.
      navRef.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: "(tabs)" }] })
      );
    }
  }, [phase, minDurationElapsed]);

  return <AnimatedSplash />;
}
