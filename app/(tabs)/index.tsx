import { useTheme } from "@/contexts/theme";
import { useAccessibility } from "@/contexts/accessibility";
import { supabase } from "@/lib/supabase";
import { Letter } from "@/types";
import { useFocusAfterTransition } from "@/hooks/use-focus-after-transition";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { TabPage } from "@/components/tab-pager";

type ObituaryLetter = Letter & { author: { nickname: string } | null };
type SortMode = "recent" | "top";

export default function HomeScreen() {
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const s = makeStyles(colors);

  const [sort, setSort] = useState<SortMode>("recent");
  const [letters, setLetters] = useState<ObituaryLetter[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((mode: SortMode) => {
    setLoading(true);
    supabase
      .from("letters")
      .select("*, author:user_profiles(nickname)")
      .eq("status", "expired")
      .eq("approved_for_obituary", true)
      .order(mode === "recent" ? "created_at" : "like_count", { ascending: false })
      .then(({ data }) => {
        setLetters((data as ObituaryLetter[]) ?? []);
        setLoading(false);
      });
  }, []);

  useFocusAfterTransition(useCallback(() => load(sort), [load, sort]));

  return (
    <TabPage style={s.container}>
      <FlatList
        data={letters}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            <Text style={s.title}>Kapinės</Text>
            <Text style={s.subtitle}>Laiškai, kurie jau nebekeliauja (praėjo savaitė)</Text>

            <View style={s.sortRow}>
              <TouchableOpacity
                style={[s.sortButton, largeTouchTargets && s.sortButtonLarge, sort === "recent" && s.sortButtonActive]}
                onPress={() => setSort("recent")}
              >
                <Text style={[s.sortText, sort === "recent" && s.sortTextActive]}>Naujausi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.sortButton, largeTouchTargets && s.sortButtonLarge, sort === "top" && s.sortButtonActive]}
                onPress={() => setSort("top")}
              >
                <Text style={[s.sortText, sort === "top" && s.sortTextActive]}>Populiariausi</Text>
              </TouchableOpacity>
            </View>

            {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />}
            {!loading && letters.length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyText}>Kol kas jokių laiškų.</Text>
                <Text style={s.emptyHint}>Seni arba nepatikę laiškai bus čia.</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.cardBody}>{item.body}</Text>
            <View style={s.cardMeta}>
              <Text style={s.cardAuthor}>{item.author?.nickname ?? "nežinomas"}</Text>
              <Text style={s.metaText}>❤ {item.like_count}</Text>
            </View>
          </View>
        )}
      />
    </TabPage>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    list: { paddingHorizontal: 16, paddingBottom: 32 },
    title: { fontSize: 32, fontWeight: "bold", color: colors.text, marginTop: 24 },
    subtitle: { fontSize: 16, color: colors.subtext, marginTop: 6, marginBottom: 20 },
    sortRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
    sortButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sortButtonLarge: { paddingVertical: 14 },
    sortButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    sortText: { fontSize: 14, color: colors.subtext, fontWeight: "600" },
    sortTextActive: { color: colors.accentText },
    empty: { alignItems: "center", paddingTop: 60 },
    emptyText: { fontSize: 18, color: colors.subtext, fontWeight: "600" },
    emptyHint: { fontSize: 14, color: colors.subtext, marginTop: 8, textAlign: "center", opacity: 0.6 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
    },
    cardBody: { fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: 12 },
    cardMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cardAuthor: { fontSize: 13, color: colors.subtext, fontStyle: "italic" },
    metaText: { fontSize: 13, color: colors.subtext },
  });
}
