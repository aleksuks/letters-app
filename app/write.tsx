import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { EnvelopeLetter } from "@/components/envelope-letter";
import { TutorialTip } from "@/components/tutorial-tip";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  Alert, Keyboard, KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput, TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";

const MAX_LENGTH = 1000;
const DRAFT_KEY = "letters.write.draft";

const PROMPTS = [
  "Kažkas ko niekam nedrįsau pasakyti",
  "Kaip šiandien man sekėsi",
  "Ko bijau",
  "Norėčiau, kad kiti žinotų",
];

export default function WriteScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentBody, setSentBody] = useState<string | null>(null);
  const [folding, setFolding] = useState(false);
  // Once a letter is actually sent, the draft is gone for good — this stops
  // the unmount-flush below from resurrecting the just-sent text as a draft
  // while the send ceremony plays out and the screen dismisses itself.
  const draftDisabledRef = useRef(false);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  const s = makeStyles(colors);

  const remaining = MAX_LENGTH - body.length;
  const canSubmit = body.trim().length >= 10 && body.length <= MAX_LENGTH;

  // Restore whatever was left unsent last time (e.g. the screen was closed —
  // via the X button, the native swipe-down-to-dismiss gesture on the modal,
  // or the Android back button — without hitting "Išsiųsti").
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((saved) => {
      if (saved) setBody(saved);
    });
  }, []);

  // Debounced persistence while typing, so the draft survives even if the
  // screen closes abruptly rather than via a clean unmount.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draftDisabledRef.current) return;
      if (body.trim().length > 0) AsyncStorage.setItem(DRAFT_KEY, body);
      else AsyncStorage.removeItem(DRAFT_KEY);
    }, 400);
    return () => clearTimeout(t);
  }, [body]);

  // Final flush on unmount, so the very last keystroke before dismissal
  // (before the debounce above had a chance to fire) isn't lost.
  useEffect(() => {
    return () => {
      if (draftDisabledRef.current) return;
      if (bodyRef.current.trim().length > 0) {
        AsyncStorage.setItem(DRAFT_KEY, bodyRef.current);
      }
    };
  }, []);

  function goBack() {
    router.back();
  }

  async function handleSubmit() {
    if (!user || !canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);

    try {
      const { error } = await supabase.from("letters").insert({
        author_id: user.id,
        body: body.trim(),
      });

      if (error) throw error;

      draftDisabledRef.current = true;
      AsyncStorage.removeItem(DRAFT_KEY);

      // Departure ceremony: the editor is replaced by the letter folding
      // into an envelope, getting sealed, and sent flying (EnvelopeLetter),
      // then the screen dismisses itself.
      Keyboard.dismiss();
      setSentBody(body.trim());
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = (e as Error).message ?? "";
      // Raised by the trg_letters_moderation_gate trigger (migration 007)
      // when the letter's keyword score crosses the reject threshold.
      if (message.includes("letter_rejected_moderation")) {
        Alert.alert(
          "Laiškas neiškeliavo",
          "Tavo laiške per daug įžeidžiančios kalbos. Keli stipresni žodžiai — ne bėda, bet toks laiškas pas nepažįstamuosius nekeliaus. Perrašyk jį ir pabandyk dar kartą."
        );
      } else {
        Alert.alert("Klaida", message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Parašyti laiškelį</Text>
        <TouchableOpacity
          style={[s.sendButton, largeTouchTargets && s.sendButtonLarge, (!canSubmit || loading) && s.sendButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || loading}
        >
          <Text style={s.sendButtonText}>Išsiųsti</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
          <TutorialTip
            id="write_intro"
            text="Nebijok rašyti nuoširdžiai — dalinamasi tik tavo slapyvardžiu."
            style={s.tip}
          />

          <TextInput
            style={s.input}
            value={body}
            onChangeText={setBody}
            placeholder="Brangus gavėjau..."
            placeholderTextColor={colors.subtext}
            multiline
            autoFocus
            maxLength={MAX_LENGTH}
            textAlignVertical="top"
          />

          <Text style={[s.counter, remaining < 100 && s.counterWarning]}>
            liko {remaining} simbolių
          </Text>

          <View style={s.prompts}>
            <Text style={s.promptsLabel}>Pasiūlymai</Text>
            <View style={s.promptsRow}>
              {PROMPTS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[s.promptChip, largeTouchTargets && s.promptChipLarge]}
                  onPress={() => setBody(p + "\n\n")}
                  activeOpacity={0.7}
                >
                  <Text style={s.promptChipText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {sentBody !== null && (
        <Animated.View style={s.sendOverlay}>
          <EnvelopeLetter
            body={sentBody}
            mode="send"
            onStart={() => setFolding(true)}
            onDone={goBack}
          />
          {folding && (
            <Animated.Text entering={FadeIn.duration(300)} style={s.sendCaption}>
              Tavo laiškas iškeliavo pas nepažįstamąjį…
            </Animated.Text>
          )}
        </Animated.View>
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
    tip: { marginHorizontal: 20, marginTop: 16 },
    input: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 28,
      padding: 20,
      minHeight: 280,
    },
    counter: {
      fontSize: 12,
      color: colors.subtext,
      textAlign: "right",
      paddingRight: 20,
      marginBottom: 24,
    },
    counterWarning: { color: colors.red },
    prompts: { paddingHorizontal: 20, paddingBottom: 40 },
    promptsLabel: { fontSize: 13, color: colors.subtext, marginBottom: 12 },
    promptsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    promptChip: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    promptChipLarge: { paddingVertical: 13 },
    promptChipText: { color: colors.subtext, fontSize: 13 },
    sendOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 24,
    },
    sendCaption: { fontSize: 14, color: colors.subtext, textAlign: "center" },
  });
}
