import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeOut } from "react-native-reanimated";
import { useTheme, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { supabase } from "@/lib/supabase";
import { EnvelopeLetter } from "@/components/envelope-letter";
import { DrawingView } from "@/components/drawing-view";
import { Letter, MapLetter } from "@/types";

type Kind = "letter" | "map_letter";

type Loaded =
  | (Letter & { author: { nickname: string } | null })
  | (MapLetter & { author: { nickname: string } | null });

// Moderator-only preview: plays the same envelope-arrival ceremony a real
// recipient sees, then shows the letter read-only. No claim, no react, no
// request-to-talk — this is a look, not a delivery.
export default function ModerationLetterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const { width } = useWindowDimensions();
  const { id, kind } = useLocalSearchParams<{ id: string; kind: Kind }>();
  const [letter, setLetter] = useState<Loaded | null | undefined>(undefined);
  const [introDone, setIntroDone] = useState(false);
  const s = makeStyles(colors);

  const table = kind === "map_letter" ? "map_letters" : "letters";
  const authorJoin = kind === "map_letter" ? "author:user_profiles!author_id(nickname)" : "author:user_profiles(nickname)";

  useEffect(() => {
    if (!id) return;
    supabase
      .from(table)
      .select(`*, ${authorJoin}`)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setLetter((data as Loaded) ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind]);

  function confirmDelete() {
    if (!letter) return;
    Alert.alert(
      "Delete permanently?",
      "This deletes the letter outright — no review queue, no undo.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from(table).delete().eq("id", letter.id);
            if (error) { Alert.alert("Error", error.message); return; }
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
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.emptyTitle}>Letter not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.from}>{letter.author?.nickname ?? "unknown"}</Text>
        <TouchableOpacity
          onPress={confirmDelete}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
        >
          <Ionicons name="trash-outline" size={22} color={colors.subtext} />
        </TouchableOpacity>
      </View>

      {introDone ? (
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.card}>
            {letter.body.trim().length > 0 && <Text style={s.body}>{letter.body}</Text>}
            {letter.drawing != null && (
              <View style={s.drawingWrap}>
                <DrawingView drawing={letter.drawing} size={Math.min(width - 96, 300)} />
              </View>
            )}
          </View>
          <Text style={s.meta}>
            ❤ {letter.like_count}
            {"dislike_count" in letter ? ` · 💀 ${letter.dislike_count}` : ""}
            {"travel_count" in letter ? ` · ${letter.travel_count} travels` : ""}
          </Text>
        </ScrollView>
      ) : (
        <Animated.View style={s.introOverlay} exiting={FadeOut.duration(400)}>
          <EnvelopeLetter
            body={letter.body}
            drawing={letter.drawing}
            mode="receive"
            onDone={() => setIntroDone(true)}
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
    closeBtn: { position: "absolute", top: 72, left: 16, zIndex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 28,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    from: { fontSize: 14, color: colors.subtext, fontStyle: "italic" },
    scroll: { padding: 20, gap: 16 },
    card: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 18,
      borderCurve: "continuous",
      padding: 24,
      ...outlineOver(colors, colors.border),
    },
    body: { fontSize: 18, color: colors.text, lineHeight: 30 },
    drawingWrap: { alignItems: "center", marginTop: 20 },
    meta: { fontSize: 13, color: colors.subtext, textAlign: "center" },
    emptyTitle: { fontSize: 20, color: colors.text, fontWeight: "bold" },
    introOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
