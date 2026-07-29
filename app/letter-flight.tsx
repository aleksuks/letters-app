import { useEffect, useState } from "react";
import {
  ActivityIndicator, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { supabase } from "@/lib/supabase";
import { DrawingView } from "@/components/drawing-view";
import type { Letter } from "@/types";
import { useStrings, format } from "@/lib/i18n";
import { letterFlightStrings } from "@/lib/i18n/strings/letter-flight";

type LetterFlightStrings = typeof letterFlightStrings.lt;

// The living twin of `letter-grave`. Same stats, same typewriter engraving,
// but on paper instead of granite — a letter that is still out there gets a
// sheet that drifts, not a stone that sits. The one thing the grave can't
// show is the only thing that matters while a letter lives: how long it has
// left.
const TICK_MS = 30_000;

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
}

function remainingUntil(expiresAt: string): Remaining | null {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60_000);
  return {
    days: Math.floor(totalMinutes / (60 * 24)),
    hours: Math.floor((totalMinutes % (60 * 24)) / 60),
    minutes: totalMinutes % 60,
  };
}

// Days are only shown once there is at least one, so a letter in its final
// hours counts down in the units its author actually cares about by then.
// Takes `t` from its caller since it's a module-level helper and can't call
// useStrings itself.
function formatRemaining(r: Remaining, t: LetterFlightStrings): string {
  return r.days > 0
    ? format(t.daysHoursMinutes, { days: r.days, hours: r.hours, minutes: r.minutes })
    : format(t.hoursMinutes, { hours: r.hours, minutes: r.minutes });
}

function daysTravelled(letter: Letter): number {
  const ms = Date.now() - new Date(letter.created_at).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function LetterFlightScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { largeTouchTargets, reducedMotion } = useAccessibility();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useStrings(letterFlightStrings);
  const [letter, setLetter] = useState<Letter | null | undefined>(undefined);
  const [, setTick] = useState(0);

  const s = makeStyles(colors);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("letters")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setLetter((data as Letter) ?? null));
  }, [id]);

  // Re-render on a slow tick so the countdown stays honest while the screen
  // is open, without a per-second timer nobody asked for.
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // The sheet drifts as if held up by the same air the letter is travelling
  // through — the screen's whole argument is "this one is still moving".
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      drift.value = 0.5;
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [reducedMotion, drift]);

  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(drift.value, [0, 1], [4, -4]) },
      { rotate: `${interpolate(drift.value, [0, 1], [-0.8, 0.8])}deg` },
    ],
  }));

  if (letter === undefined) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (letter === null) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
            accessibilityRole="button"
            accessibilityLabel={t.close}
          >
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <Text style={s.emptyTitle}>{t.gone}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const left = remainingUntil(letter.expires_at);
  const stillFlying = letter.status === "active" && left !== null;
  const travelled = daysTravelled(letter);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel={t.close}
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        <Text style={s.caption}>
          {stillFlying ? t.stillFlying : t.journeyOver}
        </Text>

        <Animated.View entering={FadeInDown.duration(500)} style={driftStyle}>
          <View style={s.sheet}>
            <Text style={s.mark}>✉︎</Text>

            {letter.body.trim().length > 0 && (
              <Text style={s.excerpt} numberOfLines={4}>
                {letter.body}
              </Text>
            )}
            {letter.drawing && (
              <DrawingView drawing={letter.drawing} size={150} style={s.excerptDrawing} />
            )}

            <View style={s.divider} />

            <View style={s.stats}>
              <View style={s.statRow}>
                <Text style={s.statLabel}>{t.statStops}</Text>
                <Text style={s.statValue}>{letter.travel_count}</Text>
              </View>
              <View style={s.statRow}>
                <Text style={s.statLabel}>{t.statHearts}</Text>
                <Text style={s.statValue}>{letter.like_count}</Text>
              </View>
              <View style={s.statRow}>
                <Text style={s.statLabel}>{t.statTravelling}</Text>
                <Text style={s.statValue}>{format(t.daysSuffix, { days: travelled })}</Text>
              </View>
            </View>

            <View style={s.divider} />

            {left && letter.status === "active" ? (
              <>
                <Text style={s.countdownLabel}>{t.countdownLabel}</Text>
                <Text style={s.countdownValue}>{formatRemaining(left, t)}</Text>
              </>
            ) : (
              <Text style={s.countdownLabel}>{t.countdownDone}</Text>
            )}

            <Text style={s.dates}>{format(t.sentOn, { date: formatDate(letter.created_at) })}</Text>
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  // Typed on paper rather than cut in stone, but the same engraving voice as
  // the headstone so the two screens read as a matched pair. Explicit
  // lineHeights throughout: SpecialElite's ascenders clip on Android
  // otherwise, which decapitates Š/Ž/ė (see letter-grave.tsx).
  const typed = {
    color: colors.text,
    fontFamily: "SpecialElite",
  } as const;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8, padding: 24 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
    body: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 48 },
    caption: { fontSize: 15, color: colors.subtext, marginBottom: 28, textAlign: "center" },
    sheet: {
      width: 280,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 4,
      paddingTop: 28,
      paddingHorizontal: 28,
      paddingBottom: 26,
      alignItems: "center",
      // Lifted further off the background than the headstone: the stone is
      // seated in the ground, the sheet is in the air.
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
      ...outlineOver(colors, colors.border),
    },
    mark: {
      ...typed,
      fontSize: 24,
      lineHeight: 34,
      marginBottom: 14,
      color: colors.accent,
    },
    excerpt: {
      fontSize: 16,
      lineHeight: 24,
      textAlign: "center",
      fontStyle: "italic",
      ...typed,
    },
    excerptDrawing: { marginTop: 10 },
    divider: {
      width: 130,
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 20,
    },
    stats: { width: 190, gap: 12 },
    statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    statLabel: { fontSize: 16, lineHeight: 24, ...typed },
    statValue: { fontSize: 18, lineHeight: 26, ...typed },
    countdownLabel: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.subtext,
      fontFamily: "SpecialElite",
      letterSpacing: 0.5,
    },
    countdownValue: {
      fontSize: 20,
      lineHeight: 30,
      marginTop: 4,
      color: colors.accent,
      fontFamily: "SpecialElite",
    },
    dates: {
      fontSize: 12,
      lineHeight: 19,
      marginTop: 20,
      letterSpacing: 1,
      color: colors.subtext,
      fontFamily: "SpecialElite",
    },
  });
}
