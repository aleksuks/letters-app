import { useEffect, useRef, useState } from "react";
import {
  View, Text, SafeAreaView, FlatList, TextInput,
  TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator,
} from "react-native";
import Animated, { FadeInLeft, FadeInRight } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/contexts/theme";
import { Message } from "@/types";

interface ConversationDetails {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: string;
  user_a: { nickname: string } | null;
  user_b: { nickname: string } | null;
}

type MessageWithSender = Message & { sender: { nickname: string } | null };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();

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
        .select("*, user_a:user_profiles!user_a_id(nickname), user_b:user_profiles!user_b_id(nickname)")
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
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, user]);

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

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerName}>{otherNickname()}</Text>
        <TouchableOpacity onPress={handleLeave} hitSlop={8}>
          <Ionicons name="exit-outline" size={24} color={colors.red ?? "#ef4444"} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          inverted
          contentContainerStyle={s.messageList}
          renderItem={({ item }) => {
            const isOwn = item.sender_id === user?.id;
            const isHistory = historyIds.current.has(item.id);
            return (
              <Animated.View
                style={[s.bubbleRow, isOwn && s.bubbleRowOwn]}
                entering={
                  isHistory
                    ? undefined
                    : (isOwn ? FadeInRight : FadeInLeft).duration(220)
                }
              >
                <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
                  <Text style={[s.bubbleText, isOwn && s.bubbleTextOwn]}>
                    {item.body}
                  </Text>
                  <Text style={[s.bubbleTime, isOwn && s.bubbleTimeOwn]}>
                    {formatTime(item.created_at)}
                  </Text>
                </View>
              </Animated.View>
            );
          }}
        />

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
            style={[s.sendButton, (!input.trim() || sending) && s.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            <Ionicons name="send" size={20} color={colors.accentText} />
          </TouchableOpacity>
        </View>
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
    headerName: { fontSize: 17, fontWeight: "600", color: colors.text },
    messageList: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    bubbleRow: { flexDirection: "row" },
    bubbleRowOwn: { justifyContent: "flex-end" },
    bubble: {
      maxWidth: "80%",
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
    },
    sendButtonDisabled: { opacity: 0.4 },
  });
}
