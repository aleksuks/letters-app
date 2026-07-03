import {
  View, Text, TouchableOpacity,
  FlatList, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { TabPage } from "@/components/tab-pager";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/use-auth";
import { useFocusAfterTransition } from "@/hooks/use-focus-after-transition";
import { useTheme } from "@/contexts/theme";
import { supabase } from "@/lib/supabase";
import { Letter } from "@/types";

export default function LettersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [myLetters, setMyLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);

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

  function handleDelete(letter: Letter) {
    Alert.alert(
      "Ištrinti laišką?",
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
                onPress={() => router.push("/receive" as any)}
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
              <Text style={[s.cardBody, s.cardBodyFlex]} numberOfLines={3}>{item.body}</Text>
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8} style={s.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color={colors.subtext} />
              </TouchableOpacity>
            </View>
            <View style={s.cardMeta}>
              <View style={s.metaStat}>
                <Ionicons name="heart" size={13} color={colors.subtext} />
                <Text style={s.metaText}>{item.like_count}</Text>
              </View>
              <View style={s.metaStat}>
                <Ionicons name="send-outline" size={13} color={colors.subtext} />
                <Text style={s.metaText}>{item.travel_count}</Text>
              </View>
              <Text style={s.metaStatus}>{statusLabel(item)}</Text>
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
    deleteBtn: { padding: 2 },
    cardMeta: { flexDirection: "row", alignItems: "center", gap: 14 },
    metaStat: { flexDirection: "row", alignItems: "center", gap: 4 },
    metaText: { fontSize: 13, color: colors.subtext },
    metaStatus: { marginLeft: "auto", fontSize: 13, color: colors.subtext },
  });
}
