import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, FlatList, TextInput,
  TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useTheme, outlineOnly } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { Message } from "@/types";
import { TutorialTip } from "@/components/tutorial-tip";
import { useUnreadMessages } from "@/contexts/unread-messages";
import { AvatarCircle } from "@/components/avatar-circle";

interface ConversationDetails {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: string;
  reported_at: string | null;
  user_a: { nickname: string; avatar_emoji: string } | null;
  user_b: { nickname: string; avatar_emoji: string } | null;
}

type MessageWithSender = Message & { sender: { nickname: string } | null };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const { markRead } = useUnreadMessages();

  const [conv, setConv] = useState<ConversationDetails | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Message ids already on screen when the chat loaded — skips the entrance
  // animation so opening a chat doesn't animate the whole history at once.
  const historyIds = useRef<Set<string>>(new Set());

  const s = makeStyles(colors);

  useEffect(() => {
    if (!id || !user) return;

    // Fetch conversation + initial messages
    Promise.all([
      supabase
        .from("conversations")
        .select("*, user_a:user_profiles!user_a_id(nickname, avatar_emoji), user_b:user_profiles!user_b_id(nickname, avatar_emoji)")
        .eq("id", id)
        .single(),
      supabase
        .from("messages")
        .select("*, sender:user_profiles!sender_id(nickname)")
        .eq("conversation_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]).then(([convRes, msgRes]) => {
      if (convRes.data) setConv(convRes.data as ConversationDetails);
      if (msgRes.data) {
        setMessages(msgRes.data as MessageWithSender[]);
        historyIds.current = new Set(msgRes.data.map(m => m.id));
      }
      setLoading(false);
      // Opening the chat is itself "reading" whatever's already here.
      markRead(id);
    });

    // Real-time: new messages
    const channel = supabase
      .channel(`chat:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const newMsg = payload.new as MessageWithSender;
          setMessages(prev => {
            // Avoid duplicates if the sender already sees it optimistically
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [newMsg, ...prev];
          });
          // The screen is open and the message just landed on it — mark it
          // read immediately rather than waiting for the next visit.
          markRead(id);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  const visibleMessages = useMemo(
    () => messages.filter(m => !(m.deleted_for_sender && m.sender_id === user?.id)),
    [messages, user]
  );

  const handleDeleteForMe = useCallback((messageId: string) => {
    Alert.alert(
      "Ištrinti žinutę sau?",
      "Ji ir toliau bus matoma kitam pokalbio dalyviui.",
      [
        { text: "Atšaukti", style: "cancel" },
        {
          text: "Ištrinti",
          style: "destructive",
          onPress: async () => {
            setMessages(prev => prev.map(m =>
              m.id === messageId ? { ...m, deleted_for_sender: true } : m
            ));
            const { error } = await supabase.rpc("delete_message_for_me", { p_message_id: messageId });
            if (error) {
              // Roll back — the RPC is the source of truth here.
              setMessages(prev => prev.map(m =>
                m.id === messageId ? { ...m, deleted_for_sender: false } : m
              ));
              Alert.alert("Klaida", error.message);
            }
          },
        },
      ]
    );
  }, []);

  async function handleSend() {
    if (!input.trim() || !user || sending) return;
    const body = input.trim();
    setInput("");
    setSending(true);

    const { error } = await supabase.from("messages").insert({
      conversation_id: id,
      sender_id: user.id,
      body,
    });

    setSending(false);
    if (error) Alert.alert("Klaida", error.message);
  }

  async function handleLeave() {
    if (!conv || !user) return;
    Alert.alert(
      "Palikti pokalbį (visam laikui)",
      "Tai užbaigs ir ištrins pokalbį abiems.",
      [
        { text: "Atšaukti", style: "cancel" },
        {
          text: "Į kapines",
          style: "destructive",
          onPress: async () => {
            const statusValue = conv.user_a_id === user.id ? "left_by_a" : "left_by_b";
            await supabase
              .from("conversations")
              .update({ status: statusValue })
              .eq("id", id);
            router.back();
          },
        },
      ]
    );
  }

  function otherNickname() {
    if (!conv || !user) return "…";
    return conv.user_a_id === user.id
      ? conv.user_b?.nickname ?? "nepažįstamasis"
      : conv.user_a?.nickname ?? "nepažįstamasis";
  }

  function otherAvatar() {
    if (!conv || !user) return "🦊";
    return conv.user_a_id === user.id
      ? conv.user_b?.avatar_emoji ?? "🦊"
      : conv.user_a?.avatar_emoji ?? "🦊";
  }

  function otherUserId() {
    if (!conv || !user) return null;
    return conv.user_a_id === user.id ? conv.user_b_id : conv.user_a_id;
  }

  async function handleBlock() {
    const otherId = otherUserId();
    if (!otherId) return;
    Alert.alert(
      "Blokuoti šį žmogų?",
      "Jis nebegalės tau rašyti ar siųsti naujų užklausų susisiekti. Šis pokalbis bus užbaigtas.",
      [
        { text: "Atšaukti", style: "cancel" },
        {
          text: "Blokuoti",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("block_user", { p_user_id: otherId });
            if (error) { Alert.alert("Klaida", error.message); return; }
            router.back();
          },
        },
      ]
    );
  }

  async function handleReport() {
    if (!conv) return;
    Alert.alert(
      "Pranešti apie pokalbį?",
      "Pokalbis bus iškart baigtas abiem pusėms. Istorija išliks matoma peržiūrai.",
      [
        { text: "Atšaukti", style: "cancel" },
        {
          text: "Netinkamas turinys",
          onPress: () => reportConversation("Netinkamas turinys"),
        },
        {
          text: "Priekabiavimas ar grasinimai",
          onPress: () => reportConversation("Priekabiavimas ar grasinimai"),
        },
      ]
    );
  }

  async function reportConversation(reason: string) {
    if (!conv) return;
    const { error } = await supabase.rpc("report_conversation", {
      p_conversation_id: conv.id,
      p_reason: reason,
    });
    if (error) { Alert.alert("Klaida", error.message); return; }
    setConv({ ...conv, status: "blocked", reported_at: new Date().toISOString() });
    Alert.alert("Ačiū", "Pranešimas gautas, pokalbis baigtas.");
  }

  function handleMore() {
    Alert.alert(
      "Pokalbio veiksmai",
      undefined,
      [
        { text: "Blokuoti", style: "destructive", onPress: handleBlock },
        { text: "Pranešti", onPress: handleReport },
        { text: "Palikti pokalbį", style: "destructive", onPress: handleLeave },
        { text: "Atšaukti", style: "cancel" },
      ]
    );
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  const canSend = !!conv && conv.status === "active" && !conv.reported_at;

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
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
          accessibilityRole="button"
          accessibilityLabel="Grįžti atgal"
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={s.headerIdentity}>
          <AvatarCircle emoji={otherAvatar()} size={28} />
          <Text style={s.headerName}>{otherNickname()}</Text>
        </View>
        <TouchableOpacity
          onPress={handleMore}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel="Pokalbio veiksmai"
          accessibilityHint="Išeiti iš pokalbio, blokuoti arba pranešti"
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <TutorialTip
        id="chat_intro"
        text="Pokalbis neįpareigoja - gali ištrinti ir išeiti be įspėjimo arba pranešti jei turinys visai nepriimtinas."
        style={s.tip}
      />

      {conv?.reported_at && (
        <View style={s.reportedBanner}>
          <Ionicons name="flag" size={14} color={colors.subtext} />
          <Text style={s.reportedBannerText}>
            Pokalbis baigtas — pranešta administratoriui.
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <FlatList
          data={visibleMessages}
          keyExtractor={item => item.id}
          inverted
          contentContainerStyle={s.messageList}
          renderItem={({ item }) => {
            const isOwn = item.sender_id === user?.id;
            const isHistory = historyIds.current.has(item.id);
            return (
              <Animated.View
                style={[s.bubbleRow, isOwn && s.bubbleRowOwn]}
                entering={isHistory ? undefined : FadeIn.duration(220)}
              >
                <Pressable
                  style={s.bubbleWrap}
                  onLongPress={isOwn ? () => handleDeleteForMe(item.id) : undefined}
                  delayLongPress={350}
                >
                  <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
                    <Text style={[s.bubbleText, isOwn && s.bubbleTextOwn]}>
                      {item.body}
                    </Text>
                    <Text style={[s.bubbleTime, isOwn && s.bubbleTimeOwn]}>
                      {formatTime(item.created_at)}
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            );
          }}
        />

        {canSend && (
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Bla bla bla..."
              placeholderTextColor={colors.subtext}
              multiline
              maxLength={1000}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[s.sendButton, largeTouchTargets && s.sendButtonLarge, (!input.trim() || sending) && s.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Siųsti žinutę"
            >
              <Ionicons name="send" size={20} color={colors.accentText} />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.tabBarBorder,
    },
    headerIdentity: { flexDirection: "row", alignItems: "center", gap: 8 },
    headerName: { fontSize: 17, fontWeight: "600", color: colors.text },
    tip: { marginHorizontal: 16, marginTop: 12 },
    reportedBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.surfaceAlt ?? colors.surface,
    },
    reportedBannerText: { fontSize: 12, color: colors.subtext, flex: 1 },
    messageList: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    bubbleRow: { flexDirection: "row" },
    bubbleRowOwn: { justifyContent: "flex-end" },
    // Width cap must live on the row's direct child — a percentage on the
    // inner bubble would resolve against this wrapper's (content-sized)
    // width, not the row, which mis-measures wrapping and alignment.
    bubbleWrap: { maxWidth: "80%" },
    bubble: {
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 4,
    },
    bubbleOwn: { backgroundColor: colors.accent },
    bubbleOther: { backgroundColor: colors.surface },
    bubbleText: { fontSize: 15, color: colors.text, lineHeight: 20 },
    bubbleTextOwn: { color: colors.accentText },
    bubbleTime: { fontSize: 11, color: colors.subtext, alignSelf: "flex-end" },
    bubbleTimeOwn: { color: "rgba(0,0,0,0.5)" },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.tabBarBorder,
      gap: 10,
    },
    input: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      maxHeight: 120,
    },
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.accent,
      justifyContent: "center",
      alignItems: "center",
      ...outlineOnly(colors),
    },
    sendButtonLarge: { width: 56, height: 56, borderRadius: 28 },
    sendButtonDisabled: { opacity: 0.4 },
  });
}
