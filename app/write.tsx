import { useTheme, outlineOnly, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE, LARGE_BUTTON } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { EnvelopeLetter } from "@/components/envelope-letter";
import { TutorialTip } from "@/components/tutorial-tip";
import { DrawingCanvas } from "@/components/drawing-canvas";
import { Drawing, emptyDrawing, isDrawingEmpty, isValidDrawing } from "@/lib/drawing";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "@/lib/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  Alert, Keyboard, KeyboardAvoidingView, Platform,
  StyleSheet,
  Text,
  TextInput, TouchableOpacity, TouchableWithoutFeedback,
  View,
} from "react-native";
// RNGH's ScrollView, not core RN's: the core one grabs the Android touch
// lock on a vertical drag, which makes gesture-handler cancel the drawing
// canvas's pan mid-stroke. RNGH's participates in gesture orchestration,
// so an active crayon stroke keeps the touch and the page doesn't scroll.
import { ScrollView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useStrings, format } from "@/lib/i18n";
import { writeStrings } from "@/lib/i18n/strings/write";

const MAX_LENGTH = 1000;
const DRAFT_KEY = "letters.write.draft";
const DRAFT_DRAWING_KEY = "letters.write.draft.drawing";
// TUNING KNOB: a text-only letter still has to be a letter. A letter that
// carries a drawing may say nothing at all — the picture is the message.
const MIN_TEXT_LENGTH = 10;
const INPUT_PADDING = 20;
const INPUT_LINE_HEIGHT = 28;
// Floor for the auto-growing input below — enough for a couple of wrapped
// placeholder lines so the box doesn't feel like a single-line field before
// the user has typed anything.
const MIN_INPUT_HEIGHT = INPUT_PADDING * 2 + INPUT_LINE_HEIGHT * 3;
// Suggestions must be visible without scrolling and without fighting the
// keyboard for space, so they're pinned a few lines below the input's own
// top edge (roughly where the first couple of typed lines would land)
// instead of docked at the bottom of the screen where the keyboard used to
// cover them.
const PROMPTS_OVERLAY_TOP = INPUT_PADDING + INPUT_LINE_HEIGHT * 3;
// Suggestions are only useful before the user has started writing — once
// they've typed a few characters they're mid-thought and the chips would
// just sit over their text.
const PROMPTS_HIDE_AT_LENGTH = 3;

// Adapted from the most consistently praised prompt sets for connecting
// strangers: Arthur Aron's "36 questions for increasing closeness" study
// (perfect day, treasured memory, long-postponed dream, gained quality)
// and the letter-writing/journaling classics (advice to a younger self,
// gratitude, encouraging an unknown reader).
// Keys into writeStrings rather than literal text, so the same random
// selection works regardless of the active language — the component looks
// up each key's translated text at render time.
const PROMPT_KEYS = [
  "promptYoungerSelf",
  "promptNeverDaredSay",
  "promptPerfectDay",
  "promptPostponedDream",
  "promptDearestMemory",
  "promptGrateful",
  "promptAfraid",
  "promptNewTrait",
  "promptEncourage",
  "promptSurprised",
] as const;
const PROMPTS_SHOWN = 3;

// Picks a few prompts at random rather than always the same ones, so the
// set feels fresh across visits to the screen. Generic so it preserves the
// literal key type when called with PROMPT_KEYS, letting t[key] type-check.
function pickRandomPrompts<T>(source: T[], count: number): T[] {
  const pool = [...source];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

export default function WriteScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const t = useStrings(writeStrings);
  const [body, setBody] = useState("");
  // Grows with the content (see onContentSizeChange below) so a short
  // letter leaves the drawing tray visible right underneath it, instead of
  // sitting inside a fixed-height box sized for a full page of text.
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const [drawing, setDrawing] = useState<Drawing>(emptyDrawing);
  const [drawingOpen, setDrawingOpen] = useState(false);
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
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const scrollRef = useRef<ScrollView>(null);
  // Chosen once per screen visit, not re-rolled on every render.
  const [promptKeys] = useState(() => pickRandomPrompts([...PROMPT_KEYS], PROMPTS_SHOWN));

  const s = makeStyles(colors);

  const remaining = MAX_LENGTH - body.length;
  const hasDrawing = !isDrawingEmpty(drawing);
  // Text, drawing, or both — but a letter with no picture still has to carry
  // enough words to be worth someone's claim.
  const canSubmit =
    body.length <= MAX_LENGTH &&
    (hasDrawing || body.trim().length >= MIN_TEXT_LENGTH);

  // Restore whatever was left unsent last time (e.g. the screen was closed —
  // via the X button, the native swipe-down-to-dismiss gesture on the modal,
  // or the Android back button — without hitting "Išsiųsti").
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((saved) => {
      if (saved) setBody(saved);
    });
    // An unsent drawing is worth more to its author than an unsent sentence,
    // so it survives a closed screen the same way the text does.
    AsyncStorage.getItem(DRAFT_DRAWING_KEY).then((saved) => {
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (isValidDrawing(parsed) && parsed.strokes.length > 0) {
          setDrawing(parsed);
          setDrawingOpen(true);
        }
      } catch {
        // A corrupt draft is not worth surfacing — start with clean paper.
      }
    });
  }, []);

  // Debounced persistence while typing, so the draft survives even if the
  // screen closes abruptly rather than via a clean unmount.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draftDisabledRef.current) return;
      if (body.trim().length > 0) AsyncStorage.setItem(DRAFT_KEY, body);
      else AsyncStorage.removeItem(DRAFT_KEY);
      if (isDrawingEmpty(drawing)) AsyncStorage.removeItem(DRAFT_DRAWING_KEY);
      else AsyncStorage.setItem(DRAFT_DRAWING_KEY, JSON.stringify(drawing));
    }, 400);
    return () => clearTimeout(t);
  }, [body, drawing]);

  // Final flush on unmount, so the very last keystroke before dismissal
  // (before the debounce above had a chance to fire) isn't lost.
  useEffect(() => {
    return () => {
      if (draftDisabledRef.current) return;
      if (bodyRef.current.trim().length > 0) {
        AsyncStorage.setItem(DRAFT_KEY, bodyRef.current);
      }
      if (!isDrawingEmpty(drawingRef.current)) {
        AsyncStorage.setItem(DRAFT_DRAWING_KEY, JSON.stringify(drawingRef.current));
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
      if (error) Alert.alert(t.errorTitle, error.message);
    }
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
          drawing: hasDrawing ? drawing : null,
        })
        .select("id")
        .single();

      if (error) throw error;

      sentLetterIdRef.current = data?.id ?? null;
      draftDisabledRef.current = true;
      AsyncStorage.removeItem(DRAFT_KEY);
      AsyncStorage.removeItem(DRAFT_DRAWING_KEY);

      // Departure ceremony: the editor is replaced by the letter folding
      // into an envelope, getting sealed, and sent flying (EnvelopeLetter),
      // then the screen dismisses itself.
      Keyboard.dismiss();
      setSentBody(body.trim());
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = (e as Error).message ?? "";
      // Raised by the same trigger (migration 040) when the body contains
      // Cyrillic. Separate from the keyword rejection because this one is a
      // fixable mistake rather than a judgment — so it says what to change.
      if (message.includes("letter_rejected_script")) {
        Alert.alert(t.rejectedTitle, t.rejectedScriptBody);
      }
      // Raised by the same trigger (migration 042) when the body contains
      // a link — the one thing that defeats the app's whole safety model.
      else if (message.includes("letter_rejected_link")) {
        Alert.alert(t.rejectedTitle, t.rejectedLinkBody);
      }
      // Raised by the trg_letters_moderation_gate trigger (migration 007)
      // when the letter's keyword score crosses the reject threshold.
      else if (message.includes("letter_rejected_moderation")) {
        Alert.alert(t.rejectedTitle, t.rejectedModerationBody);
      } else {
        Alert.alert(t.errorTitle, message);
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
          accessibilityLabel={t.close}
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t.headerTitle}</Text>
        <TouchableOpacity
          style={[s.sendButton, largeTouchTargets && s.sendButtonLarge, (!canSubmit || loading) && s.sendButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || loading}
        >
          <Text style={s.sendButtonText}>{t.sendButton}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView ref={scrollRef} style={s.scroll} keyboardShouldPersistTaps="handled">
          <TutorialTip
            id="write_intro"
            text={t.tipIntro}
            style={s.tip}
          />

          <View style={s.inputWrap}>
            <TextInput
              style={[s.input, { height: Math.max(MIN_INPUT_HEIGHT, inputHeight) }]}
              value={body}
              onChangeText={setBody}
              onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
              placeholder={t.inputPlaceholder}
              placeholderTextColor={colors.subtext}
              multiline
              autoFocus
              maxLength={MAX_LENGTH}
              textAlignVertical="top"
            />

            {/* Pinned near the top of the input (not docked at the screen's
                bottom) so it's visible above the keyboard from the moment
                the screen opens, and it fades out the instant the user has
                actually started writing. Purely inspirational — not
                clickable/insertable — so they read as ideas, not
                prewritten text to just tap in. */}
            {body.length < PROMPTS_HIDE_AT_LENGTH && (
              <Animated.View
                style={s.promptsOverlay}
                pointerEvents="none"
                exiting={FadeOut.duration(300)}
              >
                <Text style={s.promptsLabel}>{t.promptsLabel}</Text>
                <View style={s.promptsRow}>
                  {promptKeys.map((key) => (
                    <View
                      key={key}
                      style={[s.promptChip, largeTouchTargets && s.promptChipLarge]}
                    >
                      <Text style={s.promptChipText}>{t[key]}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}
          </View>

          <Text style={[s.counter, remaining < 100 && s.counterWarning]}>
            {format(t.counter, { remaining })}
          </Text>

          {/* A picture is optional and stays folded away until asked for, so
              the blank page is still a blank page and not a choice of two
              tools. Once opened it lives below the text: a letter with both
              reads top to bottom, words then drawing. */}
          {!drawingOpen ? (
            <TouchableOpacity
              style={[s.drawToggle, largeTouchTargets && s.drawToggleLarge]}
              // The canvas and its colour tray sit below the fold; leaving the
              // keyboard up covers them entirely.
              onPress={() => {
                Keyboard.dismiss();
                setDrawingOpen(true);
                // After layout has actually grown by the canvas's height —
                // scrolling in the same tick lands on the old content size.
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
              }}
              activeOpacity={0.7}
            >
              <Text style={s.drawToggleIcon}>🖍️</Text>
              <Text style={s.drawToggleText}>{t.addDrawing}</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.drawSection}>
              <View style={s.drawHeader}>
                <Text style={s.drawTitle}>{t.drawingTitle}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setDrawing(emptyDrawing());
                    setDrawingOpen(false);
                  }}
                  hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
                >
                  <Text style={s.drawRemove}>{t.drawingRemove}</Text>
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
            onDone={goBack}
          />
          {folding ? (
            <Animated.Text entering={FadeIn.duration(300)} style={s.sendCaption}>
              {t.sendCaption}
            </Animated.Text>
          ) : (
            // Available only until the launch swipe commits — after that the
            // letter has flown and there is nothing left to take back.
            <TouchableOpacity
              style={[s.sendCancelButton, largeTouchTargets && s.sendCancelButtonLarge]}
              onPress={handleCancelSend}
              activeOpacity={0.7}
            >
              <Text style={s.sendCancelText}>{t.sendCancel}</Text>
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
    tip: { marginHorizontal: 20, marginTop: 16 },
    sendCancelButton: {
      borderRadius: 12,
      paddingHorizontal: 28,
      paddingVertical: 12,
      ...outlineOver(colors, colors.border),
    },
    sendCancelButtonLarge: LARGE_BUTTON,
    sendCancelText: { color: colors.subtext, fontSize: 15, fontWeight: "600" },
    inputWrap: { position: "relative" },
    input: {
      color: colors.text,
      fontSize: 18,
      lineHeight: INPUT_LINE_HEIGHT,
      padding: INPUT_PADDING,
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
    promptsOverlay: {
      position: "absolute",
      top: PROMPTS_OVERLAY_TOP,
      left: 0,
      right: 0,
    },
    promptsLabel: { fontSize: 13, color: colors.subtext, marginBottom: 8, paddingHorizontal: 20 },
    promptsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20 },
    promptChip: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      ...outlineOver(colors, colors.border),
    },
    promptChipLarge: LARGE_BUTTON,
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
