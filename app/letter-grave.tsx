import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, StyleSheet, Text, TouchableOpacity,
  useWindowDimensions, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useProfile } from "@/contexts/profile";
import { supabase } from "@/lib/supabase";
import { DrawingView } from "@/components/drawing-view";
import type { Letter } from "@/types";
import { useStrings, format } from "@/lib/i18n";
import { letterGraveStrings } from "@/lib/i18n/strings/letter-grave";

// A headstone is stone regardless of the app's warm-paper theme, so the
// granite palette is fixed rather than pulled from `colors`. Engraving is
// faked with a dark fill plus a light shadow beneath, which reads as an
// incised (recessed) cut on the stone face.
const STONE = {
  face: "#A19C92",
  edge: "#8A857B",
  plinth: "#78736A",
  engrave: "#33302B",
  engraveShadow: "#BEB9AF",
};

// A drawing is never engraved into the stone — colour crayon cut in granite
// fights everything this screen is doing. Instead the picture is propped
// behind the headstone like something left at a grave, with just enough of it
// showing to be noticed and tapped.
const PEEK_SIZE = 150;

// Days lived, anchored on the actual death (graveyard vote or timed
// expiry). died_at should always be set once a letter is expired; the
// expires_at fallback keeps the stone honest if it somehow isn't.
function daysLived(letter: Letter): number {
  const end = letter.died_at
    ? new Date(letter.died_at).getTime()
    : new Date(letter.expires_at).getTime();
  const ms = end - new Date(letter.created_at).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function LetterGraveScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const { profile } = useProfile();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const t = useStrings(letterGraveStrings);
  const [letter, setLetter] = useState<Letter | null | undefined>(undefined);
  const [drawingOpen, setDrawingOpen] = useState(false);

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

  // Sound effect placeholder — a soft toll will play here once the audio
  // asset lands (kept out of the fetch so it fires on the reveal, not the
  // request). See product notes: "add a sound effect for that later."

  // Moderator-only escape hatch (migration 044): a published Obituary
  // entry has already cleared review, but the founder may still want to
  // pull one straight away rather than leave it up.
  function confirmModeratorDelete() {
    if (!letter) return;
    const letterId = letter.id;
    Alert.alert(
      "Delete permanently?",
      "This deletes the letter outright — no undo.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("letters").delete().eq("id", letterId);
            if (error) { Alert.alert("Klaida", error.message); return; }
            router.back();
          },
        },
      ]
    );
  }

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
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel={t.close}
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.emptyTitle}>{t.gone}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const days = daysLived(letter);

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
        {profile?.is_moderator && (
          <TouchableOpacity
            onPress={confirmModeratorDelete}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
            accessibilityRole="button"
            accessibilityLabel="Delete letter"
          >
            <Ionicons name="trash-outline" size={22} color={colors.subtext} />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.body}>
        <Text style={s.caption}>{t.caption}</Text>

        <Animated.View entering={FadeInDown.duration(500)} style={s.monument}>
          {/* Rendered before the stone and given no elevation, so it sits
              behind it on both platforms — Android composites by elevation
              rather than document order, and the stone's elevation:5 keeps
              it in front regardless. */}
          {letter.drawing && (
            <TouchableOpacity
              style={s.peek}
              onPress={() => setDrawingOpen(true)}
              activeOpacity={0.85}
              accessibilityLabel={t.peekDrawing}
            >
              <View style={s.peekCard}>
                <DrawingView drawing={letter.drawing} size={PEEK_SIZE} />
              </View>
            </TouchableOpacity>
          )}

          <View style={s.stone}>
            <Text style={s.cross}>†</Text>

            <Text style={s.epitaph} numberOfLines={4}>
              {letter.body}
            </Text>

            <View style={s.divider} />

            <View style={s.stats}>
              <View style={s.statRow}>
                <Text style={s.statLabel}>{t.statStops}</Text>
                <Text style={s.statValue}>{letter.travel_count}</Text>
              </View>
              <View style={s.statRow}>
                <Text style={s.statLabel}>{t.statHearts}</Text>
                <Text style={s.statValue}>{letter.total_like_count}</Text>
              </View>
              <View style={s.statRow}>
                <Text style={s.statLabel}>{t.statLived}</Text>
                <Text style={s.statValue}>{format(t.daysSuffix, { days })}</Text>
              </View>
            </View>

            <Text style={s.dates}>
              {formatDate(letter.created_at)} —{" "}
              {formatDate(letter.died_at ?? letter.expires_at)}
            </Text>
          </View>
          <View style={s.plinth} />
        </Animated.View>
      </View>

      {/* Tap the propped picture to see it whole; tap anywhere to put it back. */}
      {drawingOpen && letter.drawing && (
        <Pressable
          style={s.viewer}
          onPress={() => setDrawingOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t.closeDrawing}
        >
          <Animated.View entering={FadeInDown.duration(220)} style={s.viewerCard}>
            <DrawingView
              drawing={letter.drawing}
              size={Math.min(windowWidth - 96, 320)}
            />
          </Animated.View>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  const engravedText = {
    color: STONE.engrave,
    textShadowColor: STONE.engraveShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0.5,
  } as const;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8, padding: 24 },
    closeBtn: { paddingHorizontal: 16, paddingVertical: 12, alignSelf: "flex-start" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
    body: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 48 },
    caption: { fontSize: 15, color: colors.subtext, marginBottom: 28, textAlign: "center" },
    monument: { alignItems: "center" },
    // Offset up and to the right of the stone's 280px face so roughly a third
    // of the card clears it — enough to read as "there's something back
    // there" without competing with the epitaph.
    peek: {
      position: "absolute",
      top: -26,
      right: -44,
      transform: [{ rotate: "7deg" }],
    },
    peekCard: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 3,
      padding: 8,
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      ...outlineOver(colors, colors.border),
    },
    viewer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(43, 35, 32, 0.55)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    viewerCard: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 4,
      padding: 16,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
      ...outlineOver(colors, colors.border),
    },
    stone: {
      width: 280,
      backgroundColor: STONE.face,
      borderTopLeftRadius: 140,
      borderTopRightRadius: 140,
      borderWidth: 2,
      borderColor: STONE.edge,
      paddingTop: 44,
      paddingHorizontal: 30,
      paddingBottom: 34,
      alignItems: "center",
      // A soft cast shadow lifts the stone off the paper background.
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    // The plinth peeks out below the stone's square base, a touch wider and
    // darker, so the monument reads as seated in the ground.
    plinth: {
      width: 300,
      height: 18,
      backgroundColor: STONE.plinth,
      borderBottomLeftRadius: 6,
      borderBottomRightRadius: 6,
      marginTop: -2,
    },
    // SpecialElite carries Lithuanian diacritics fine, but its ascenders sit
    // high in the em box and Android clips the top of the line when no
    // lineHeight is set — which silently decapitates Š/Ž/ė and makes correctly
    // spelled labels look misspelled. Every engraved style below therefore
    // sets an explicit, generous lineHeight.
    cross: {
      fontSize: 30,
      lineHeight: 40,
      fontFamily: "SpecialElite",
      marginBottom: 18,
      ...engravedText,
    },
    epitaph: {
      fontSize: 16,
      lineHeight: 24,
      fontFamily: "SpecialElite",
      textAlign: "center",
      fontStyle: "italic",
      ...engravedText,
    },
    divider: {
      width: 130,
      height: 1,
      backgroundColor: STONE.edge,
      marginVertical: 22,
    },
    stats: { width: 190, gap: 12 },
    statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    statLabel: { fontSize: 16, lineHeight: 24, fontFamily: "SpecialElite", ...engravedText },
    statValue: { fontSize: 18, lineHeight: 26, fontFamily: "SpecialElite", ...engravedText },
    dates: {
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "SpecialElite",
      marginTop: 24,
      letterSpacing: 1,
      ...engravedText,
    },
  });
}
