import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  useWindowDimensions, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { DoubleTapLike } from "@/components/double-tap-like";
import { DrawingView } from "@/components/drawing-view";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import * as Haptics from "@/lib/haptics";
import type { MapLetter } from "@/types";

interface LoadedMapLetter extends MapLetter {
  author: { nickname: string; accepts_requests: boolean } | null;
}

// Reading view for a letter found on the map. Unlike receive.tsx there is
// no claim/slot machinery — the map is a public surface — so this is a
// plain fetch-by-id, guarded by the map_letters RLS policies.
export default function MapLetterScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const { id, openRequest } = useLocalSearchParams<{ id: string; openRequest?: string }>();
  const [letter, setLetter] = useState<LoadedMapLetter | null | undefined>(undefined);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();

  const s = makeStyles(colors);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("map_letters")
      .select("*, author:user_profiles!author_id(nickname, accepts_requests)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        const loaded = (data as LoadedMapLetter) ?? null;
        setLetter(loaded);
        if (loaded) setLikeCount(loaded.like_count);
      });
    // RLS on map_letter_likes only exposes the caller's own rows, so
    // filtering by letter alone answers "have I already liked this?".
    supabase
      .from("map_letter_likes")
      .select("id")
      .eq("map_letter_id", id)
      .maybeSingle()
      .then(({ data }) => setLiked(data != null));
  }, [id]);

  const isOwn = letter != null && letter.author_id === user?.id;
  const canRequest = letter != null && !isOwn && letter.author?.accepts_requests !== false;

  // Short letters are shown in full right on the map, so a tap there skips
  // straight to the contact prompt instead of landing on a read view with
  // nothing left to read.
  useEffect(() => {
    if (openRequest === "1" && canRequest) setShowRequestForm(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter, openRequest]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("lt-LT", { month: "long", day: "numeric" });
  }

  // Fired by the double-tap gesture on the paper. The heart burst plays
  // either way; the RPC toggles, so a second tap withdraws the like.
  async function handleLike() {
    if (!letter) return;
    const wasLiked = liked;
    // Optimistic: the RPC toggles server-side too, and only fails in edge
    // states (letter just expired/reported), where reverting is honest enough.
    setLiked(!wasLiked);
    setLikeCount((c) => c + (wasLiked ? -1 : 1));
    const { error } = await supabase.rpc("like_map_letter", {
      p_map_letter_id: letter.id,
    });
    if (error) {
      setLiked(wasLiked);
      setLikeCount((c) => c + (wasLiked ? 1 : -1));
      if (error.message?.includes("letter_not_active")) {
        Alert.alert("Laiškelio nebėra", "Šis laiškelis jau pasibaigė.");
      } else if (!error.message?.includes("cannot_like_own")) {
        Alert.alert("Klaida", error.message);
      }
    }
  }

  async function handleSendRequest() {
    if (!letter || !user || !greeting.trim()) return;
    setSendingRequest(true);

    const { error } = await supabase.from("connection_requests").insert({
      map_letter_id: letter.id,
      requester_id: user.id,
      author_id: letter.author_id,
      greeting: greeting.trim(),
    });

    setSendingRequest(false);

    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error.code === "23505") {
        Alert.alert("Leidimo jau prašyta", "Jau išsiuntei užklausą susisiekti su siuntėju.");
      } else if (error.message?.includes("conversation_exists")) {
        // Deliberately doesn't say who — naming the author here would
        // deanonymize their other letters.
        Alert.alert(
          "Pokalbis jau vyksta",
          "Su šio laiškelio autoriumi jau turi pokalbį — atsiverskite jį skiltyje „Pokalbiai“."
        );
      } else if (error.code === "42501") {
        Alert.alert("Nepriima užklausų", "Šis žmogus šiuo metu nepriima pokalbių užklausų.");
      } else {
        Alert.alert("Klaida", error.message);
      }
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowRequestForm(false);
    setGreeting("");
    setRequestSent(true);
  }

  async function handleReport(reason: string) {
    if (!letter) return;
    const { error } = await supabase.rpc("report_map_letter", {
      p_map_letter_id: letter.id,
      p_reason: reason,
    });
    if (error) { Alert.alert("Klaida", error.message); return; }
    Alert.alert("Ačiū", "Praneštas laiškelis pašalintas iš žemėlapio, kol jį peržiūrės administratorius.");
    router.back();
  }

  function confirmReport() {
    Alert.alert(
      "Pranešti apie laiškelį?",
      "Laiškelis bus iškart pašalintas iš žemėlapio, kol jį peržiūrės administratorius.",
      [
        { text: "Atšaukti", style: "cancel" },
        { text: "Netinkamas turinys", onPress: () => handleReport("Netinkamas turinys") },
        { text: "Priekabiavimas ar grasinimai", onPress: () => handleReport("Priekabiavimas ar grasinimai") },
      ]
    );
  }

  function confirmDelete() {
    Alert.alert(
      "Pašalinti laiškelį?",
      "Laiškelis visam laikui dings iš žemėlapio.",
      [
        { text: "Atšaukti", style: "cancel" },
        {
          text: "Pašalinti",
          style: "destructive",
          onPress: async () => {
            if (!letter) return;
            const { error } = await supabase.from("map_letters").delete().eq("id", letter.id);
            if (error) { Alert.alert("Klaida", error.message); return; }
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
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()} hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.emptyTitle}>Laiškelio čia nebėra</Text>
          <Text style={s.emptyHint}>Jis pasibaigė arba buvo pašalintas.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        {!isOwn && (
          <TouchableOpacity onPress={confirmReport} hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}>
            <Ionicons name="flag-outline" size={22} color={colors.subtext} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <DoubleTapLike disabled={isOwn} onLike={handleLike} style={s.paper}>
            {letter.body.trim().length > 0 && (
              <Text style={s.body}>{letter.body}</Text>
            )}
            {letter.drawing && (
              <View style={s.drawingWrap}>
                <DrawingView drawing={letter.drawing} size={Math.min(width - 96, 300)} />
              </View>
            )}
            <Text style={s.signature}>— {letter.author?.nickname ?? "nepažįstamasis"}</Text>
          </DoubleTapLike>

          <Text style={s.meta}>
            Paliktas {formatDate(letter.created_at)} · guls čia iki {formatDate(letter.expires_at)}
            {likeCount > 0 ? ` · ❤ ${likeCount}` : ""}
          </Text>

          {!isOwn && (
            <Text style={s.likeHint}>
              {liked
                ? "Patiko. Bakstelėk dar kartą du kartus, jei nori atšaukti."
                : "Patiko? Bakstelėk laiškelį du kartus."}
            </Text>
          )}

          {isOwn ? (
            <TouchableOpacity
              style={[s.secondaryButton, largeTouchTargets && s.buttonLarge]}
              onPress={confirmDelete}
            >
              <Ionicons name="trash-outline" size={18} color={colors.red} />
              <Text style={[s.secondaryButtonText, { color: colors.red }]}>Pašalinti laiškelį</Text>
            </TouchableOpacity>
          ) : requestSent ? (
            <Animated.View entering={FadeIn.duration(300)} style={s.sentNote}>
              <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
              <Text style={s.sentNoteText}>
                Užklausa išsiųsta. Jei autorius sutiks, pokalbį rasi skiltyje „Pokalbiai“.
              </Text>
            </Animated.View>
          ) : showRequestForm ? (
            <View style={s.requestForm}>
              <Text style={s.requestLabel}>
                Parašyk trumpą žinutę — autorius nuspręs, ar pradėti pokalbį.
              </Text>
              <TextInput
                style={s.requestInput}
                value={greeting}
                onChangeText={setGreeting}
                placeholder="Sveiki! Manau, šis laiškelis skirtas man..."
                placeholderTextColor={colors.subtext}
                multiline
                autoFocus
                maxLength={300}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
              />
              <View style={s.requestActions}>
                <TouchableOpacity
                  style={[s.secondaryButton, largeTouchTargets && s.buttonLarge]}
                  onPress={() => setShowRequestForm(false)}
                >
                  <Text style={s.secondaryButtonText}>Atšaukti</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryButton, largeTouchTargets && s.buttonLarge, (!greeting.trim() || sendingRequest) && s.buttonDisabled]}
                  onPress={handleSendRequest}
                  disabled={!greeting.trim() || sendingRequest}
                >
                  <Text style={s.primaryButtonText}>Siųsti</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : canRequest ? (
            <TouchableOpacity
              style={[s.primaryButton, largeTouchTargets && s.buttonLarge]}
              onPress={() => setShowRequestForm(true)}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.accentText} />
              <Text style={s.primaryButtonText}>Atsiliepti autoriui</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8, padding: 24 },
    closeBtn: { paddingHorizontal: 16, paddingVertical: 12, alignSelf: "flex-start" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    scroll: { padding: 20, gap: 16 },
    paper: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 22,
      gap: 16,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    body: { fontSize: 17, lineHeight: 26, color: colors.text, fontFamily: "SpecialElite" },
    signature: { fontSize: 15, color: colors.subtext, textAlign: "right", fontFamily: "SpecialElite" },
    drawingWrap: { alignItems: "center", marginTop: 16, marginBottom: 4 },
    meta: { fontSize: 13, color: colors.subtext, textAlign: "center" },
    likeHint: { fontSize: 12, color: colors.subtext, textAlign: "center", opacity: 0.7 },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
    emptyHint: { fontSize: 14, color: colors.subtext },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 20,
    },
    primaryButtonText: { color: colors.accentText, fontWeight: "bold", fontSize: 15 },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 20,
    },
    secondaryButtonText: { color: colors.subtext, fontSize: 15, fontWeight: "600" },
    buttonLarge: { paddingVertical: 17 },
    buttonDisabled: { opacity: 0.4 },
    requestForm: { gap: 12 },
    requestLabel: { fontSize: 13, color: colors.subtext, lineHeight: 18 },
    requestInput: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontSize: 15,
      padding: 14,
      minHeight: 90,
      textAlignVertical: "top",
    },
    requestActions: { flexDirection: "row", gap: 10 },
    sentNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    sentNoteText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 19 },
  });
}
