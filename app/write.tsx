import { useTheme } from "@/contexts/theme";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { FoldingLetter } from "@/components/folding-letter";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert, Keyboard, KeyboardAvoidingView, Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput, TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

const MAX_LENGTH = 1000;

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
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentBody, setSentBody] = useState<string | null>(null);

  const s = makeStyles(colors);

  const remaining = MAX_LENGTH - body.length;
  const canSubmit = body.trim().length >= 10 && body.length <= MAX_LENGTH;

  function goBack() {
    router.back();
  }

  async function handleSubmit() {
    if (!user || !canSubmit) return;
    setLoading(true);

    try {
      const { error } = await supabase.from("letters").insert({
        author_id: user.id,
        body: body.trim(),
      });

      if (error) throw error;

      // Departure animation: the editor is replaced by the written text on
      // a paper sheet that folds into an envelope and flies away (see
      // FoldingLetter), then the screen dismisses itself.
      Keyboard.dismiss();
      setSentBody(body.trim());
    } catch (e) {
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Parašyti laiškelį</Text>
        <TouchableOpacity
          style={[s.sendButton, (!canSubmit || loading) && s.sendButtonDisabled]}
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
                  style={s.promptChip}
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
        <Animated.View style={s.sendOverlay} entering={FadeIn.duration(250)}>
          <FoldingLetter body={sentBody} mode="send" onDone={goBack} />
          <Animated.Text
            entering={FadeIn.delay(800).duration(300)}
            style={s.sendCaption}
          >
            Tavo laiškas iškeliavo pas nepažįstamąjį…
          </Animated.Text>
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
    sendButtonDisabled: { opacity: 0.4 },
    sendButtonText: { color: colors.accentText, fontWeight: "bold", fontSize: 15 },
    scroll: { flex: 1 },
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
