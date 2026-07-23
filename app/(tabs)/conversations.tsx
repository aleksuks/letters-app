import { useCallback, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { TabPage } from "@/components/tab-pager";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useFocusAfterTransition } from "@/hooks/use-focus-after-transition";
import { useTheme } from "@/contexts/theme";
import { useAccessibility } from "@/contexts/accessibility";
import { TutorialTip } from "@/components/tutorial-tip";

interface ConversationItem {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: string;
  created_at: string;
  user_a: { nickname: string } | null;
  user_b: { nickname: string } | null;
}

interface RequestItem {
  id: string;
  letter_id: string | null;
  map_letter_id: string | null;
  requester_id: string;
  greeting: string;
  created_at: string;
  letter: { body: string } | null;
  map_letter: { body: string } | null;
  requester: { nickname: string } | null;
}

export default function ConversationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  const s = makeStyles(colors);

  const load = useCallback(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("conversations")
        .select("*, user_a:user_profiles!user_a_id(nickname), user_b:user_profiles!user_b_id(nickname)")
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      supabase
        .from("connection_requests")
        .select("*, letter:letters(body), map_letter:map_letters(body), requester:user_profiles!requester_id(nickname)")
        .eq("author_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]).then(([convRes, reqRes]) => {
      setConversations((convRes.data as ConversationItem[]) ?? []);
      setRequests((reqRes.data as RequestItem[]) ?? []);
      setLoading(false);
    });
  }, [user]);

  useFocusAfterTransition(load);

  function otherNickname(conv: ConversationItem) {
    if (conv.user_a_id === user?.id) return conv.user_b?.nickname ?? "nepažįstamasis";
    return conv.user_a?.nickname ?? "nepažįstamasis";
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  async function handleAccept(requestId: string) {
    const { data: convId, error } = await supabase.rpc("accept_connection_request", {
      p_request_id: requestId,
    });

    if (error) {
      if (error.message?.includes("conversation_exists")) {
        // Deliberately doesn't say who — naming the requester here would
        // deanonymize them via whichever conversation already exists.
        Alert.alert(
          "Pokalbis jau vyksta",
          "Su šiuo žmogumi jau turi pokalbį — atsiverk jį skiltyje „Pokalbiai“."
        );
      } else {
        Alert.alert("Klaida", error.message);
      }
      return;
    }

    setRequests(prev => prev.filter(r => r.id !== requestId));
    router.push(`/chat/${convId}` as any);
  }

  async function handleDecline(requestId: string) {
    const { error } = await supabase
      .from("connection_requests")
      .update({ status: "declined" })
      .eq("id", requestId);

    if (error) { Alert.alert("Klaida", error.message); return; }
    setRequests(prev => prev.filter(r => r.id !== requestId));
  }

  if (loading) {
    return (
      <TabPage style={s.container}>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </TabPage>
    );
  }

  return (
    <TabPage style={s.container}>
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            <Text style={s.title}>Pokalbiai</Text>

            <TutorialTip
              id="conversations_intro"
              text="Jei kas norės su tavimi susisiekti, užklausą matysi čia. Jei nepriimsi, jie to net nesužinos."
            />

            {requests.length > 0 && (
              <View style={s.requestsSection}>
                <Text style={s.sectionTitle}>Užklausos susisiekti</Text>
                {requests.map(item => (
                  <View key={item.id} style={s.card}>
                    <Text style={s.nickname}>{item.requester?.nickname ?? "nepažįstamasis"}</Text>
                    <Text style={s.letterPreview} numberOfLines={2}>
                      re: „{item.letter?.body ?? item.map_letter?.body ?? ""}“
                    </Text>
                    <Text style={s.greeting}>„{item.greeting}“</Text>
                    <View style={s.cardActions}>
                      <TouchableOpacity
                        style={[s.declineButton, largeTouchTargets && s.cardButtonLarge]}
                        onPress={() => handleDecline(item.id)}
                      >
                        <Text style={s.declineText}>Atmesti</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.acceptButton, largeTouchTargets && s.cardButtonLarge]}
                        onPress={() => handleAccept(item.id)}
                      >
                        <Text style={s.acceptText}>Priimti</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={s.sectionTitle}>Žinutės</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Text style={s.empty}>Kol kas jokių pokalbių.</Text>
            <Text style={s.emptyHint}>
              Norint pradėti pokalbį, priimk užklausą susisiekti.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.row}
            onPress={() => router.push(`/chat/${item.id}` as any)}
            activeOpacity={0.7}
          >
            <View style={s.avatar}>
              <Ionicons name="person" size={22} color={colors.accentText} />
            </View>
            <View style={s.rowContent}>
              <Text style={s.rowName}>{otherNickname(item)}</Text>
              <Text style={s.rowDate}>{formatDate(item.created_at)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </TouchableOpacity>
        )}
      />
    </TabPage>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    title: { fontSize: 32, fontWeight: "bold", color: colors.text, marginTop: 24, marginBottom: 8 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
    list: { paddingHorizontal: 16, paddingBottom: 32, gap: 2 },
    empty: { fontSize: 15, color: colors.subtext, fontWeight: "600" },
    emptyHint: { fontSize: 13, color: colors.subtext },
    requestsSection: { marginTop: 16, marginBottom: 8, gap: 12 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.subtext,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
      marginTop: 8,
    },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 8 },
    nickname: { fontSize: 16, fontWeight: "700", color: colors.text },
    letterPreview: { fontSize: 13, color: colors.subtext, fontStyle: "italic" },
    greeting: { fontSize: 15, color: colors.text, marginTop: 4 },
    cardActions: { flexDirection: "row", gap: 10, marginTop: 8 },
    cardButtonLarge: { paddingVertical: 15 },
    declineButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    declineText: { color: colors.subtext, fontSize: 15 },
    acceptButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: "center",
    },
    acceptText: { color: colors.accentText, fontSize: 15, fontWeight: "bold" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 4,
      gap: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    rowContent: { flex: 1 },
    rowName: { fontSize: 16, fontWeight: "600", color: colors.text },
    rowDate: { fontSize: 13, color: colors.subtext, marginTop: 2 },
  });
}
