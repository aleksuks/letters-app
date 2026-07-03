import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert,
  FlatList, SafeAreaView, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/theme";
import { supabase } from "@/lib/supabase";
import { Letter } from "@/types";

type QueueLetter = Letter & { author: { nickname: string } | null };

export default function ModerationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [letters, setLetters] = useState<QueueLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("letters")
      .select("*, author:user_profiles(nickname)")
      .eq("status", "expired")
      .eq("obituary_reviewed", false)
      .order("expires_at", { ascending: true })
      .then(({ data }) => {
        setLetters((data as QueueLetter[]) ?? []);
        setLoading(false);
      });
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function review(letter: QueueLetter, approve: boolean) {
    setActingOn(letter.id);
    const { error } = await supabase
      .from("letters")
      .update({ obituary_reviewed: true, approved_for_obituary: approve })
      .eq("id", letter.id);

    setActingOn(null);
    if (error) {
      Alert.alert("Klaida", error.message);
      return;
    }
    setLetters((prev) => prev.filter((l) => l.id !== letter.id));
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Moderation</Text>
      </View>

      <FlatList
        data={letters}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />}
            {!loading && letters.length === 0 && (
              <Text style={s.empty}>Nothing pending review.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.cardBody}>{item.body}</Text>
            <View style={s.cardMeta}>
              <Text style={s.metaText}>{item.author?.nickname ?? "unknown"}</Text>
              <Text style={s.metaText}>❤ {item.like_count} · {item.travel_count} travels</Text>
            </View>
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.actionButton, s.rejectButton]}
                onPress={() => review(item, false)}
                disabled={actingOn === item.id}
              >
                <Ionicons name="close" size={18} color={colors.subtext} />
                <Text style={s.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionButton, s.approveButton]}
                onPress={() => review(item, true)}
                disabled={actingOn === item.id}
              >
                <Ionicons name="checkmark" size={18} color={colors.accentText} />
                <Text style={s.approveText}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 24,
    },
    backButton: { marginRight: 16 },
    title: { fontSize: 28, fontWeight: "bold", color: colors.text, flex: 1 },
    list: { paddingHorizontal: 16, paddingBottom: 32 },
    empty: { color: colors.subtext, fontSize: 15, marginTop: 4 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
    },
    cardBody: { fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: 12 },
    cardMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    metaText: { fontSize: 13, color: colors.subtext },
    actionRow: { flexDirection: "row", gap: 10 },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 10,
      paddingVertical: 10,
    },
    rejectButton: { borderWidth: 1, borderColor: colors.border },
    rejectText: { fontSize: 14, color: colors.subtext, fontWeight: "600" },
    approveButton: { backgroundColor: colors.accent },
    approveText: { fontSize: 14, color: colors.accentText, fontWeight: "600" },
  });
}
