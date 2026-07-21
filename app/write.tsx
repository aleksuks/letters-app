import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { EnvelopeLetter } from "@/components/envelope-letter";
import { TutorialTip } from "@/components/tutorial-tip";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "@/lib/haptics";
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

// Adapted from the most consistently praised prompt sets for connecting
// strangers: Arthur Aron's "36 questions for increasing closeness" study
// (perfect day, treasured memory, long-postponed dream, gained quality)
// and the letter-writing/journaling classics (advice to a younger self,
// gratitude, encouraging an unknown reader).
const PROMPTS = [
  "Ką pasakytum jaunesniam sau?",
  "Ko niekam nedrįsai pasakyti?",
  "Kaip atrodytų tobula tavo diena?",
  "Apie ką seniai svajoji, bet vis atidedi?",
  "Koks prisiminimas tau brangiausias?",
  "Už ką šiandien esi dėkingas?",
  "Ko bijai?",
  "Jei rytoj atsibustum įgijęs vieną naują savybę — kokią?",
  "Padrąsink žmogų, kuriam šiandien sunku.",
  "Kas tave neseniai nustebino gerąja prasme?",
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
  // The letter row is inserted before the ceremony plays (so moderation
  // errors surface immediately); its id lets the cancel button take the
  // send back by deleting the row while the envelope is still on screen.
  const sentLetterIdRef = useRef<string | null>(null);
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

  // Takes back a send while the envelope ceremony is still waiting on the
  // user (before the launch swipe commits): delete the just-inserted row
  // and put the editor back exactly as it was. If a fast reader already
  // claimed the letter, the receive screen explains the withdrawal to them.
  async function handleCancelSend() {
    const letterId = sentLetterIdRef.current;
    sentLetterIdRef.current = null;
    setSentBody(null);
    setFolding(false);
    draftDisabledRef.current = false;
    if (letterId) {
      const { error } = await supabase.from("letters").delete().eq("id", letterId);
      if (error) Alert.alert("Klaida", error.message);
    }
  }

  function insertPrompt(p: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Never clobber text the user already typed — append instead.
    setBody(prev => (prev.trim().length > 0 ? `${prev.trimEnd()}\n\n${p}\n` : `${p}\n`));
  }

  async function handleSubmit() {
    if (!user || !canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("letters")
        .insert({
          author_id: user.id,
          body: body.trim(),
        })
        .select("id")
        .single();

      if (error) throw error;

      sentLetterIdRef.current = data?.id ?? null;
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
        </ScrollView>

        {/* Docked below the editor, inside the KeyboardAvoidingView, so the
            suggestions ride on top of the keyboard instead of hiding under
            it at the bottom of the scroll. */}
        <View style={s.prompts}>
          <Text style={s.promptsLabel}>Pasiūlymai</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.promptsRow}
          >
            {PROMPTS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[s.promptChip, largeTouchTargets && s.promptChipLarge]}
                onPress={() => insertPrompt(p)}
                activeOpacity={0.7}
              >
                <Text style={s.promptChipText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {sentBody !== null && (
        <Animated.View style={s.sendOverlay}>
          <EnvelopeLetter
            body={sentBody}
            mode="send"
            onStart={() => setFolding(true)}
            onDone={goBack}
          />
          {folding ? (
            <Animated.Text entering={FadeIn.duration(300)} style={s.sendCaption}>
              Tavo laiškas iškeliavo pas nepažįstamąjį…
            </Animated.Text>
          ) : (
            // Available only until the launch swipe commits — after that the
            // letter has flown and there is nothing left to take back.
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
    sendCancelButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 28,
      paddingVertical: 12,
    },
    sendCancelButtonLarge: { paddingVertical: 16 },
    sendCancelText: { color: colors.subtext, fontSize: 15, fontWeight: "600" },
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
    prompts: {
      paddingTop: 10,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    promptsLabel: { fontSize: 13, color: colors.subtext, marginBottom: 8, paddingHorizontal: 20 },
    promptsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20 },
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
