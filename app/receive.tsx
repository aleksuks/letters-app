import { useTheme } from "@/contexts/theme";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Letter } from "@/types";
import { FoldingLetter } from "@/components/folding-letter";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert,
  Keyboard,
  KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type LetterWithAuthor = Letter & { author: { nickname: string; accepts_requests: boolean } | null };

type Reaction = "none" | "liked" | "disliked";

type ScreenState =
  | { phase: "loading" }
  | { phase: "empty" }
  | { phase: "ready"; letter: LetterWithAuthor; reaction: Reaction };

export default function ReceiveScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [state, setState] = useState<ScreenState>({ phase: "loading" });

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  // Arrival animation: a full-screen overlay plays the folded letter flying
  // in from the bottom and unfolding (FoldingLetter), then cross-fades away
  // to reveal the reading layout. Action buttons fade in only after that.
  const actionsOpacity = useSharedValue(0);

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsOpacity.value,
  }));

  const s = makeStyles(colors);

  useEffect(() => {
    if (!user) return;
    fetchLetter();
  }, [user]);

  function handleIntroDone() {
    setIntroDone(true);
    actionsOpacity.value = withTiming(1, { duration: 250 });
  }

  async function fetchLetter() {
    if (!user) return;
    setState({ phase: "loading" });

    // Eligibility (reach cap, hourly pacing, not-own, not-seen) and the
    // random pick all live in the receive_letter() RPC, which also records
    // the delivery atomically.
    const { data, error } = await supabase.rpc("receive_letter");

    if (error || !data || data.length === 0) {
      setState({ phase: "empty" });
      return;
    }

    const row = data[0];
    const letter: LetterWithAuthor = {
      ...row,
      author: {
        nickname: row.author_nickname,
        accepts_requests: row.author_accepts_requests,
      },
    };

    setState({ phase: "ready", letter, reaction: "none" });
  }

  async function handleLike() {
    if (state.phase !== "ready" || state.reaction !== "none") return;
    const { error } = await supabase.rpc("like_letter", { p_letter_id: state.letter.id });
    if (error) { Alert.alert("Klaida", error.message); return; }
    setState({ ...state, reaction: "liked" });
  }

  async function handleDislike() {
    if (state.phase !== "ready" || state.reaction !== "none") return;
    const { error } = await supabase.rpc("dislike_letter", { p_letter_id: state.letter.id });
    if (error) { Alert.alert("Klaida", error.message); return; }
    setState({ ...state, reaction: "disliked" });
  }

  async function handleReport(reason: string) {
    if (state.phase !== "ready") return;
    const { error } = await supabase.rpc("report_letter", {
      p_letter_id: state.letter.id,
      p_reason: reason,
    });
    if (error) { Alert.alert("Klaida", error.message); return; }
    Alert.alert("Ačiū", "Praneštas laiškas pašalintas iš apyvartos, kol jį peržiūrės administratorius.");
    router.back();
  }

  function confirmReport() {
    if (state.phase !== "ready") return;
    Alert.alert(
      "Pranešti apie laišką?",
      "Laiškas bus iškart pašalintas iš apyvartos, kol jį peržiūrės administratorius.",
      [
        { text: "Atšaukti", style: "cancel" },
        { text: "Netinkamas turinys", onPress: () => handleReport("Netinkamas turinys") },
        { text: "Priekabiavimas ar grasinimai", onPress: () => handleReport("Priekabiavimas ar grasinimai") },
      ]
    );
  }

  async function handleSendRequest() {
    if (state.phase !== "ready" || !user || !greeting.trim()) return;
    setSendingRequest(true);

    const { error } = await supabase.from("connection_requests").insert({
      letter_id: state.letter.id,
      requester_id: user.id,
      author_id: state.letter.author_id,
      greeting: greeting.trim(),
    });

    setSendingRequest(false);

    if (error) {
      if (error.code === "23505") {
        Alert.alert("Leidimo jau prašyta", "Jau išsiuntei užklausą susisiekti su siuntėju.");
      } else if (error.code === "42501") {
        Alert.alert("Nepriima užklausų", "Šis žmogus šiuo metu nepriima pokalbių užklausų.");
      } else {
        Alert.alert("Klaida", error.message);
      }
      return;
    }

    setShowRequestForm(false);
    setGreeting("");
    setRequestSent(true);
  }

  if (state.phase === "loading") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (state.phase === "empty") {
    return (
      <SafeAreaView style={s.container}>
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.emptyTitle}>Kol kas jokių laiškų</Text>
          <Text style={s.emptyHint}>
            Pasaulis tylus. Pabandyk vėliau, arba parašyk pats.
          </Text>
          <TouchableOpacity style={s.emptyButton} onPress={() => router.back()}>
            <Text style={s.emptyButtonText}>Atgal</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { letter, reaction } = state;
  const canRequest = letter.author?.accepts_requests !== false;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.from}>nuo {letter.author?.nickname ?? "nepažįstamasis"}</Text>
        <TouchableOpacity onPress={confirmReport} hitSlop={8}>
          <Ionicons name="flag-outline" size={22} color={colors.subtext} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          <Text style={s.body}>{letter.body}</Text>
        </ScrollView>

        <Animated.View
          style={[s.actions, actionsStyle]}
          pointerEvents={introDone ? "auto" : "none"}
        >
          {/* Like / dislike */}
          {reaction === "none" && (
            <View style={s.reactionRow}>
              <TouchableOpacity
                style={[s.reactionButton, s.dislikeButton]}
                onPress={handleDislike}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="grave-stone" size={20} color={colors.subtext} />
                <Text style={s.dislikeText}>Į kapines</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.reactionButton, s.likeButton]}
                onPress={handleLike}
                activeOpacity={0.7}
              >
                <Ionicons name="heart-outline" size={22} color={colors.accent} />
                <Text style={s.likeText}>Patiko</Text>
              </TouchableOpacity>
            </View>
          )}

          {reaction === "liked" && (
            <View style={s.reactionResultRow}>
              <Ionicons name="heart" size={18} color={colors.accent} />
              <Text style={s.reactionResultText}>Patiko - keliauja toliau</Text>
            </View>
          )}

          {reaction === "disliked" && (
            <View style={s.reactionResultRow}>
              <MaterialCommunityIcons name="grave-stone" size={18} color={colors.subtext} />
              <Text style={s.reactionResultText}>Iškeliavo į kapines</Text>
            </View>
          )}

          {/* Request to talk */}
          {canRequest && !showRequestForm && !requestSent && (
            <TouchableOpacity
              style={s.requestButton}
              onPress={() => setShowRequestForm(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubble-outline" size={20} color={colors.subtext} />
              <Text style={s.requestText}>Prašymas susisiekti</Text>
            </TouchableOpacity>
          )}

          {!canRequest && !requestSent && (
            <Text style={s.requestClosedText}>Šis žmogus šiuo metu nepriima pokalbių užklausų.</Text>
          )}

          {showRequestForm && (
            <View style={s.greetingForm}>
              <TextInput
                style={s.greetingInput}
                value={greeting}
                onChangeText={setGreeting}
                placeholder="Trumpai pasisveikink…"
                placeholderTextColor={colors.subtext}
                multiline
                maxLength={200}
                autoFocus
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <View style={s.greetingRow}>
                <TouchableOpacity
                  style={s.cancelButton}
                  onPress={() => { setShowRequestForm(false); setGreeting(""); }}
                >
                  <Text style={s.cancelText}>Atšaukti</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.sendGreetingButton, (!greeting.trim() || sendingRequest) && s.disabledButton]}
                  onPress={handleSendRequest}
                  disabled={!greeting.trim() || sendingRequest}
                >
                  {sendingRequest
                    ? <ActivityIndicator color={colors.accentText} size="small" />
                    : <Text style={s.sendGreetingText}>Išsiųsti</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {requestSent && (
            <View style={s.sentRow}>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              <Text style={s.sentText}>Prašymas išsiųstas, o siuntėjas pagalvos ar sutinka.</Text>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>

      {!introDone && (
        <Animated.View style={s.introOverlay} exiting={FadeOut.duration(250)}>
          <FoldingLetter body={letter.body} mode="receive" onDone={handleIntroDone} />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
    closeBtn: { position: "absolute", top: 56, left: 16, zIndex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    from: { fontSize: 14, color: colors.subtext, fontStyle: "italic" },
    scroll: { flex: 1 },
    scrollContent: { padding: 24, paddingTop: 32 },
    body: { fontSize: 18, color: colors.text, lineHeight: 30 },
    actions: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 28,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 12,
    },
    reactionRow: { flexDirection: "row", gap: 10 },
    reactionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 14,
    },
    likeButton: { borderColor: colors.accent },
    likeText: { fontSize: 15, color: colors.accent, fontWeight: "600" },
    dislikeButton: { borderColor: colors.border },
    dislikeText: { fontSize: 15, color: colors.subtext, fontWeight: "600" },
    reactionResultRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", paddingVertical: 14 },
    reactionResultText: { fontSize: 15, color: colors.subtext },
    requestButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
    },
    requestText: { fontSize: 15, color: colors.subtext },
    requestClosedText: { fontSize: 13, color: colors.subtext, textAlign: "center", paddingVertical: 12 },
    greetingForm: { gap: 10 },
    greetingInput: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      padding: 14,
      color: colors.text,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 80,
      textAlignVertical: "top",
    },
    greetingRow: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
    cancelButton: { paddingHorizontal: 16, paddingVertical: 10 },
    cancelText: { color: colors.subtext, fontSize: 15 },
    sendGreetingButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    sendGreetingText: { color: colors.accentText, fontWeight: "bold", fontSize: 15 },
    disabledButton: { opacity: 0.4 },
    sentRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", paddingVertical: 8 },
    sentText: { fontSize: 13, color: colors.subtext },
    emptyTitle: { fontSize: 20, color: colors.text, fontWeight: "bold", marginBottom: 12 },
    emptyHint: { fontSize: 15, color: colors.subtext, textAlign: "center", lineHeight: 22, marginBottom: 32 },
    emptyButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
    emptyButtonText: { color: colors.text, fontSize: 15 },
    introOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
