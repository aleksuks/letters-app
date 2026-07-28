import {
  View, Text, TouchableOpacity,
  FlatList, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { TabPage } from "@/components/tab-pager";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/use-auth";
import { useFocusAfterTransition } from "@/hooks/use-focus-after-transition";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { supabase } from "@/lib/supabase";
import { TutorialTip } from "@/components/tutorial-tip";
import { FlyingLetter } from "@/components/flying-letter";
import { DrawingView } from "@/components/drawing-view";
import { Letter } from "@/types";

export default function LettersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const [myLetters, setMyLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const s = makeStyles(colors);

  const load = useCallback(() => {
    if (!user) return;
    supabase
      .from("letters")
      .select("*")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setMyLetters(data ?? []);
        setLoading(false);
      });
  }, [user]);

  useFocusAfterTransition(load);

  // Guards against a fast double-tap pushing two /receive instances at
  // once — each claims a different letter server-side (receive_letter() is
  // atomic per call), but only the topmost screen's dismissal releases its
  // claim; the other stays mounted underneath with an orphaned, unopened
  // claim until the server reaper catches it 15 minutes later. Resetting
  // on focus (not a timer) means the button re-arms exactly when the
  // receive modal is dismissed and this screen is visible again.
  const navigatingToReceiveRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      navigatingToReceiveRef.current = false;
    }, [])
  );

  function handleReceivePress() {
    if (navigatingToReceiveRef.current) return;
    navigatingToReceiveRef.current = true;
    router.push("/receive" as any);
  }

  function handleDelete(letter: Letter) {
    Alert.alert(
      "Ištrinti laiškelį?",
      "Šio veiksmo atšaukti negalėsi.",
      [
        { text: "Atšaukti", style: "cancel" },
        {
          text: "Ištrinti",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("letters").delete().eq("id", letter.id);
            if (error) {
              Alert.alert("Klaida", error.message);
              return;
            }
            setMyLetters((prev) => prev.filter((l) => l.id !== letter.id));
          },
        },
      ]
    );
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function daysLeft(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  function statusLabel(letter: Letter) {
    if (letter.status === "active") return `jam liko ${daysLeft(letter.expires_at)} d.`;
    if (letter.status === "expired") return "nebegaliojantis";
    return "ištrintas moderatoriaus";
  }

  return (
    <TabPage style={s.container}>
      <FlatList
        data={myLetters}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text style={s.title}>Laiškeliai</Text>

            <TutorialTip
              id="letters_intro"
              text="Čia gali parašyti arba gauti laiškelį iš atsitiktinio žmogaus."
            />

            <View style={s.actions}>
              <TouchableOpacity
                style={s.primaryButton}
                onPress={() => router.push("/write" as any)}
                activeOpacity={0.8}
              >
                <Ionicons name="create-outline" size={22} color={colors.accentText} />
                <Text style={s.primaryButtonText}>Parašyti laiškelį</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.secondaryButton}
                onPress={handleReceivePress}
                activeOpacity={0.8}
              >
                <Ionicons name="mail-open-outline" size={22} color={colors.accent} />
                <Text style={s.secondaryButtonText}>Gauti laiškelį</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.sectionTitle}>Mano laiškeliai</Text>

            {loading && (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
            )}
            {!loading && myLetters.length === 0 && (
              <Text style={s.empty}>Kol kas nieko neparašei.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardTop}>
              <TouchableOpacity style={s.cardBodyFlex} onPress={() => toggleExpanded(item.id)} activeOpacity={0.7}>
                {item.body.trim().length > 0 && (
                  <Text style={s.cardBody} numberOfLines={expandedIds.has(item.id) ? undefined : 3}>{item.body}</Text>
                )}
                {/* A thumbnail while collapsed, full size once expanded — the
                    row stays scannable but the picture is still reachable
                    without opening anything. */}
                {item.drawing && (
                  <View style={s.cardDrawing}>
                    <DrawingView
                      drawing={item.drawing}
                      size={expandedIds.has(item.id) ? 200 : 64}
                    />
                  </View>
                )}
              </TouchableOpacity>
              <View style={s.cardActions}>
                {item.status === "expired" && (
                  <TouchableOpacity
                    onPress={() => router.push(`/letter-grave?id=${item.id}` as any)}
                    hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
                    style={s.graveBtn}
                    accessibilityLabel="Peržiūrėti laiškelio kapą"
                  >
                    <Text style={s.graveIcon}>🪦</Text>
                  </TouchableOpacity>
                )}
                {/* Same slot the headstone occupies once the journey ends, so
                    the row's state is legible at a glance: drifting envelope
                    while it travels, stone once it doesn't. */}
                {item.status === "active" && (
                  <TouchableOpacity
                    onPress={() => router.push(`/letter-flight?id=${item.id}` as any)}
                    hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
                    style={s.graveBtn}
                    accessibilityLabel="Peržiūrėti keliaujantį laiškelį"
                  >
                    <FlyingLetter size={18} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
                  style={s.deleteBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Ištrinti laiškelį"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.subtext} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.cardMeta}>
              <View style={s.metaStat}>
                <Ionicons name="send-outline" size={13} color={colors.subtext} />
                <Text style={s.metaText}>{item.travel_count}</Text>
              </View>
              <Text style={s.metaStatus}>{statusLabel(item)}</Text>
            </View>
            {/* Same two-line breakdown as the Obituary card, so an author can
                tell in-flight hearts from post-mortem ones on their own
                letters too — no toggle here, you can't afterlike your own. */}
            <View style={s.heartStats}>
              <View style={s.metaCountRow}>
                <Text style={s.metaCountLabel}>surinko beskraidant:</Text>
                <Text style={s.heartText}>❤ {item.like_count}</Text>
              </View>
              <View style={s.metaCountRow}>
                <Text style={s.metaCountLabel}>surinko patekus į kapines:</Text>
                <Text style={s.heartText}>❤ {item.after_like_count}</Text>
              </View>
            </View>
          </View>
        )}
        contentContainerStyle={s.list}
      />
    </TabPage>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    list: { paddingHorizontal: 16, paddingBottom: 32 },
    title: {
      fontSize: 32,
      fontWeight: "bold",
      color: colors.text,
      marginTop: 24,
      marginBottom: 24,
    },
    actions: { gap: 12, marginBottom: 36 },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    primaryButtonText: { color: colors.accentText, fontWeight: "bold", fontSize: 16 },
    secondaryButton: {
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    secondaryButtonText: { color: colors.accent, fontWeight: "600", fontSize: 16 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.subtext,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    empty: { color: colors.subtext, fontSize: 15, marginTop: 4 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
    },
    cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    cardBody: {
      fontSize: 15,
      color: colors.text,
      lineHeight: 22,
      marginBottom: 12,
    },
    cardBodyFlex: { flex: 1 },
    cardDrawing: { marginBottom: 12 },
    cardActions: { flexDirection: "row", alignItems: "center", gap: 6 },
    graveBtn: { padding: 2 },
    graveIcon: { fontSize: 18 },
    deleteBtn: { padding: 2 },
    cardMeta: { flexDirection: "row", alignItems: "center", gap: 14 },
    metaStat: { flexDirection: "row", alignItems: "center", gap: 4 },
    metaText: { fontSize: 13, color: colors.subtext },
    metaStatus: { marginLeft: "auto", fontSize: 13, color: colors.subtext },
    heartStats: { gap: 3, marginTop: 6 },
    metaCountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    metaCountLabel: { fontSize: 11, color: colors.subtext, opacity: 0.7 },
    heartText: { fontSize: 13, color: colors.subtext },
  });
}
