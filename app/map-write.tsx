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
import { useTheme, outlineOnly, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE, LARGE_BUTTON } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { EnvelopeLetter } from "@/components/envelope-letter";
import { DrawingCanvas } from "@/components/drawing-canvas";
import { Drawing, emptyDrawing, isDrawingEmpty } from "@/lib/drawing";
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
  const [drawing, setDrawing] = useState<Drawing>(emptyDrawing);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [sentBody, setSentBody] = useState<string | null>(null);
  const [folding, setFolding] = useState(false);
  // Inserted before the ceremony plays (so moderation errors surface
  // immediately); the id lets the cancel button take the send back.
  const sentLetterIdRef = useRef<string | null>(null);

  const s = makeStyles(colors);

  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const remaining = MAX_LENGTH - body.length;
  const hasDrawing = !isDrawingEmpty(drawing);
  // Same rule as the pool write screen: a picture may stand alone, words on
  // their own still have to amount to something.
  const canSubmit =
    body.length <= MAX_LENGTH &&
    (hasDrawing || body.trim().length >= 10) &&
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
        .insert({
          author_id: user.id,
          body: body.trim(),
          drawing: hasDrawing ? drawing : null,
          lat,
          lng,
        })
        .select("id")
        .single();

      if (error) throw error;

      sentLetterIdRef.current = data?.id ?? null;
      Keyboard.dismiss();
      setSentBody(body.trim());
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = (e as Error).message ?? "";
      // Same script gate as pool letters (migration 040).
      if (message.includes("letter_rejected_script")) {
        Alert.alert(
          "Laiškelis nepaliktas",
          "Laiškelius galima rašyti tik lotyniškomis raidėmis. Perrašyk laiškelį lietuviškai ir pabandyk dar kartą."
        );
      }
      // Same keyword gate as pool letters (migration 007, reused in 031).
      else if (message.includes("letter_rejected_moderation")) {
        Alert.alert(
          "Laiškelis nepaliktas",
          "Tavo laiškelyje per daug įžeidžiančios kalbos. Stipresnė kalba nieko tokio, bet šiuo atveju truputį persistengta, ir toks laiškelis čia būti negalės. Pabandyk perrašyti."
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
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
            accessibilityRole="button"
            accessibilityLabel="Uždaryti"
          >
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
          <ScrollView ref={scrollRef} style={s.scroll} keyboardShouldPersistTaps="handled">
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

            {!drawingOpen ? (
              <TouchableOpacity
                style={[s.drawToggle, largeTouchTargets && s.drawToggleLarge]}
                // See write.tsx: the tray is below the fold and the keyboard
                // would sit on top of it.
                onPress={() => {
                  Keyboard.dismiss();
                  setDrawingOpen(true);
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
                }}
                activeOpacity={0.7}
              >
                <Text style={s.drawToggleIcon}>🖍️</Text>
                <Text style={s.drawToggleText}>Pridėti piešinį</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.drawSection}>
                <View style={s.drawHeader}>
                  <Text style={s.drawTitle}>Piešinys</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setDrawing(emptyDrawing());
                      setDrawingOpen(false);
                    }}
                    hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
                  >
                    <Text style={s.drawRemove}>Pašalinti</Text>
                  </TouchableOpacity>
                </View>
                <DrawingCanvas value={drawing} onChange={setDrawing} />
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {sentBody !== null && (
          <Animated.View style={s.sendOverlay}>
            <EnvelopeLetter
              body={sentBody}
              drawing={hasDrawing ? drawing : null}
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
      ...outlineOnly(colors),
    },
    sendButtonLarge: LARGE_BUTTON,
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
      padding: 12,
      ...outlineOver(colors, colors.border),
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
    drawToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginHorizontal: 20,
      marginBottom: 32,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
      ...outlineOver(colors, colors.border),
    },
    drawToggleLarge: LARGE_BUTTON,
    drawToggleIcon: { fontSize: 18 },
    drawToggleText: { fontSize: 15, color: colors.subtext, fontWeight: "600" },
    drawSection: { paddingHorizontal: 20, marginBottom: 32, gap: 12 },
    drawHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    drawTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.subtext,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    drawRemove: { fontSize: 14, color: colors.subtext },
    sendOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 24,
    },
    sendCancelButton: {
      borderRadius: 12,
      paddingHorizontal: 28,
      paddingVertical: 12,
      ...outlineOver(colors, colors.border),
    },
    sendCancelButtonLarge: LARGE_BUTTON,
    sendCancelText: { color: colors.subtext, fontSize: 15, fontWeight: "600" },
    sendCaption: { fontSize: 14, color: colors.subtext, textAlign: "center" },
  });
}
