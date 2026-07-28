import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity,
  StyleSheet, FlatList, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

interface BlockedRow {
  id: string;
  blocked_id: string;
  created_at: string;
  blocked: { nickname: string } | null;
}

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const s = makeStyles(colors);

  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("blocked_users")
      .select("id, blocked_id, created_at, blocked:user_profiles!blocked_id(nickname)")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRows((data as unknown as BlockedRow[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmUnblock(row: BlockedRow) {
    Alert.alert(
      "Atblokuoti?",
      `${row.blocked?.nickname ?? "Šis vartotojas"} vėl galės siųsti tau užklausas pokalbiams ir žinutes.`,
      [
        { text: "Atšaukti", style: "cancel" },
        { text: "Atblokuoti", onPress: () => handleUnblock(row) },
      ]
    );
  }

  async function handleUnblock(row: BlockedRow) {
    setUnblocking(row.id);
    const prev = rows;
    setRows(rows.filter(r => r.id !== row.id));

    const { error } = await supabase.rpc("unblock_user", { p_user_id: row.blocked_id });

    setUnblocking(null);
    if (error) {
      setRows(prev);
      Alert.alert("Klaida", error.message);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backButton}
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel="Grįžti atgal"
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Blokuoti vartotojai</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <Text style={s.empty}>Niekas nėra užblokuotas.</Text>
          }
          renderItem={({ item }) => (
            <View style={s.row}>
              <Text style={s.nickname}>{item.blocked?.nickname ?? "nepažįstamasis"}</Text>
              <TouchableOpacity
                style={s.unblockButton}
                onPress={() => confirmUnblock(item)}
                disabled={unblocking === item.id}
                accessibilityRole="button"
                accessibilityLabel={`Atblokuoti ${item.blocked?.nickname ?? ""}`}
              >
                <Text style={s.unblockText}>
                  {unblocking === item.id ? "..." : "Atblokuoti"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
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
    row: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    nickname: { fontSize: 16, color: colors.text, fontWeight: "500" },
    unblockButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    unblockText: { fontSize: 14, color: colors.text, fontWeight: "600" },
  });
}
