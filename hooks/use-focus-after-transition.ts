import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { useTabPager } from "@/components/tab-pager";

// The slide may start slightly before or after the focus event depending on
// react-navigation's event ordering, so both cases are handled: an already
// in-flight transition is awaited, and one beginning within this grace
// period is caught by the "start" phase. If neither happens (initial mount,
// returning from a pushed screen), the callback runs after the grace period.
const TRANSITION_START_GRACE_MS = 50;

/**
 * Like useFocusEffect, but when focus arrives via an animated tab switch the
 * callback is deferred until the slide ends, so fetching and list re-renders
 * don't drop animation frames mid-slide.
 *
 * `effect` must be referentially stable (wrap it in useCallback), same as
 * the callback of useFocusEffect.
 */
export function useFocusAfterTransition(effect: () => void) {
  const pager = useTabPager();

  useFocusEffect(
    useCallback(() => {
      let done = false;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;

      const run = () => {
        if (done) return;
        done = true;
        effect();
      };

      const unsubscribe = pager.subscribe((phase) => {
        if (phase === "start") {
          if (graceTimer) clearTimeout(graceTimer);
        } else {
          run();
        }
      });

      if (!pager.isTransitioning()) {
        graceTimer = setTimeout(run, TRANSITION_START_GRACE_MS);
      }

      return () => {
        done = true;
        unsubscribe();
        if (graceTimer) clearTimeout(graceTimer);
      };
    }, [pager, effect])
  );
}
