import { useRef, useState } from "react";
import {
  Alert, Keyboard, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, TouchableWithoutFeedback, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { EnvelopeLetter } from "@/components/envelope-letter";
import * as Haptics from "@/lib/haptics";

const MAX_LENGTH = 600;

// Composition for a map letter — same bones as write.tsx, but addressed to
// a place instead of the random pool: the spot is already chosen (lat/lng
// params from the map tab), the framing nudges toward "to someone who was
// here", and there's no draft persistence since a draft detached from its
// location would be meaningless.
export default function MapWriteScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const params = useLocalSearchParams<{ lat: string; lng: string }>();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentBody, setSentBody] = useState<string | null>(null);
  const [folding, setFolding] = useState(false);
  // Inserted before the ceremony plays (so moderation errors surface
  // immediately); the id lets the cancel button take the send back.
  const sentLetterIdRef = useRef<string | null>(null);

  const s = makeStyles(colors);

  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const remaining = MAX_LENGTH - body.length;
  const canSubmit =
    body.trim().length >= 10 && body.length <= MAX_LENGTH &&
    Number.isFinite(lat) && Number.isFinite(lng);

  async function handleCancelSend() {
    const letterId = sentLetterIdRef.current;
    sentLetterIdRef.current = null;
    setSentBody(null);
    setFolding(false);
    if (letterId) {
      const { error } = await supabase.from("map_letters").delete().eq("id", letterId);
      if (error) Alert.alert("Klaida", error.message);
    }
  }

  async function handleSubmit() {
    if (!user || !canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("map_letters")
        .insert({ author_id: user.id, body: body.trim(), lat, lng })
        .select("id")
        .single();

      if (error) throw error;

      sentLetterIdRef.current = data?.id ?? null;
      Keyboard.dismiss();
      setSentBody(body.trim());
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = (e as Error).message ?? "";
      // Same keyword gate as pool letters (migration 007, reused in 031).
      if (message.includes("letter_rejected_moderation")) {
        Alert.alert(
          "Laiškas nepaliktas",
          "Tavo laiške per daug įžeidžiančios kalbos. Keli stipresni žodžiai — ne bėda, bet toks laiškas čia negulės. Perrašyk jį ir pabandyk dar kartą."
        );
      } else {
        Alert.alert("Klaida", message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Palikti laiškelį čia</Text>
          <TouchableOpacity
            style={[s.sendButton, largeTouchTargets && s.sendButtonLarge, (!canSubmit || loading) && s.sendButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || loading}
          >
            <Text style={s.sendButtonText}>Palikti</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.placeNote}>
              <Ionicons name="location" size={16} color={colors.accent} />
              <Text style={s.placeNoteText}>
                Laiškelis gulės pažymėtoje vietoje 30 dienų — galbūt jį ras tas, kam jis skirtas.
              </Text>
            </View>

            <TextInput
              style={s.input}
              value={body}
              onChangeText={setBody}
              placeholder="Tau, kurį čia sutikau..."
              placeholderTextColor={colors.subtext}
              multiline
              autoFocus
              maxLength={MAX_LENGTH}
              textAlignVertical="top"
            />

            <Text style={[s.counter, remaining < 60 && s.counterWarning]}>
              liko {remaining} simbolių
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>

        {sentBody !== null && (
          <Animated.View style={s.sendOverlay}>
            <EnvelopeLetter
              body={sentBody}
              mode="send"
              onStart={() => setFolding(true)}
              onDone={() => router.back()}
            />
            {folding ? (
              <Animated.Text entering={FadeIn.duration(300)} style={s.sendCaption}>
                Tavo laiškelis liko gulėti šioje vietoje…
              </Animated.Text>
            ) : (
              <TouchableOpacity
                style={[s.sendCancelButton, largeTouchTargets && s.sendCancelButtonLarge]}
                onPress={handleCancelSend}
                activeOpacity={0.7}
              >
                <Text style={s.sendCancelText}>Atšaukti</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 17, fontWeight: "600", color: colors.text },
    sendButton: {
      backgroundColor: colors.accent,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    sendButtonLarge: { paddingVertical: 14 },
    sendButtonDisabled: { opacity: 0.4 },
    sendButtonText: { color: colors.accentText, fontWeight: "bold", fontSize: 15 },
    scroll: { flex: 1 },
    placeNote: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginHorizontal: 20,
      marginTop: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    placeNoteText: { flex: 1, fontSize: 13, color: colors.subtext, lineHeight: 18 },
    input: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 28,
      padding: 20,
      minHeight: 240,
    },
    counter: {
      fontSize: 12,
      color: colors.subtext,
      textAlign: "right",
      paddingRight: 20,
      marginBottom: 24,
    },
    counterWarning: { color: colors.red },
    sendOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 24,
    },
    sendCancelButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 28,
      paddingVertical: 12,
    },
    sendCancelButtonLarge: { paddingVertical: 16 },
    sendCancelText: { color: colors.subtext, fontSize: 15, fontWeight: "600" },
    sendCaption: { fontSize: 14, color: colors.subtext, textAlign: "center" },
  });
}
