import { useTheme, outlineOnly, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE, LARGE_BUTTON } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Letter } from "@/types";
import { EnvelopeLetter } from "@/components/envelope-letter";
import { DrawingView } from "@/components/drawing-view";
import { TutorialTip } from "@/components/tutorial-tip";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "@/lib/haptics";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert,
  Keyboard,
  KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type LetterWithAuthor = Letter & { author: { nickname: string; accepts_requests: boolean } | null };

type Reaction = "none" | "liked" | "disliked";

type ScreenState =
  | { phase: "loading" }
  | { phase: "empty" }
  | { phase: "ready"; letter: LetterWithAuthor; reaction: Reaction };

// How far (fraction of screen width) the card must be dragged before release
// commits the reaction; a fast horizontal flick commits from a shorter drag.
const SWIPE_COMMIT_FRACTION = 0.35;
const SWIPE_FLICK_VELOCITY = 900;
const SWIPE_FLICK_MIN_DRAG = 40;

export default function ReceiveScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets, reducedMotion } = useAccessibility();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<ScreenState>({ phase: "loading" });

  // The receive_letter() claim is provisional until the server hears the
  // letter was actually shown (open_letter at intro end). If the reader
  // backs out before that, release_letter returns the delivery slot to the
  // pool; the server-side reaper covers crashes where this never runs.
  const claimRef = useRef<{ letterId: string; opened: boolean } | null>(null);
  const mountedRef = useRef(true);

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  // Arrival animation: a full-screen overlay plays the envelope arriving,
  // opening, and giving up the letter (EnvelopeLetter), then cross-fades
  // away to reveal the reading layout. Action buttons fade in only after.
  const actionsOpacity = useSharedValue(0);
  // Fades the overlay to solid white as the final pull-free swipe plays out,
  // so the cut to the reading layout reads as a deliberate flash-to-white
  // rather than the letter's motion just stopping dead.
  const whiteFade = useSharedValue(0);

  // Tinder-style reaction swipe: the letter card follows the finger
  // horizontally; right = forward to someone new (like), left = graveyard
  // (dislike). Committing flings the card off-screen, then the RPC runs;
  // if it fails, the card springs back.
  const cardX = useSharedValue(0);
  const cardY = useSharedValue(0);
  const swipeCommitting = useSharedValue(false);

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsOpacity.value,
  }));

  const whiteStyle = useAnimatedStyle(() => ({
    opacity: whiteFade.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cardX.value },
      { translateY: cardY.value },
      { rotateZ: `${(cardX.value / width) * 10}deg` },
    ],
  }));

  // The two commitment badges fade in with drag distance, Tinder-style:
  // the heart stamp on a rightward drag, the gravestone on a leftward one.
  const likeBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cardX.value, [16, 96], [0, 1], "clamp"),
  }));

  const dislikeBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cardX.value, [-96, -16], [1, 0], "clamp"),
  }));

  const s = makeStyles(colors);

  useEffect(() => {
    if (!user) return;
    fetchLetter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Unmount covers every exit path the close button doesn't (hardware back,
  // swipe-back gesture, auth loss). Refs keep the latest claim visible here.
  useEffect(() => () => {
    mountedRef.current = false;
    releaseIfUnread();
  }, []);

  function releaseIfUnread() {
    const claim = claimRef.current;
    if (!claim || claim.opened) return;
    claimRef.current = null;
    // Best-effort: if this never lands, the server-side reaper releases the
    // stale claim on its own.
    void supabase.rpc("release_letter", { p_letter_id: claim.letterId });
  }

  function handleClose() {
    releaseIfUnread();
    router.back();
  }

  // The author deleted the letter while this reader held a claim on it —
  // the recipient row cascade-deleted, so every reaction RPC fails with
  // not_a_recipient. Turn that into a human explanation instead of a raw
  // error, and close the screen since there is nothing left to react to.
  function letterWithdrawn() {
    claimRef.current = null;
    Alert.alert(
      "Laiškelis atšauktas",
      "Siuntėjas atšaukė savo laiškelį prieš tau spėjant jį perskaityti.",
      [{ text: "Gerai", onPress: () => router.back() }]
    );
  }

  function handleIntroDone() {
    setIntroDone(true);
    actionsOpacity.value = withTiming(1, { duration: 250 });

    // The reader has seen the letter — confirm the delivery so the claim
    // becomes permanent. One silent retry; beyond that, reacting confirms
    // implicitly server-side.
    const claim = claimRef.current;
    if (!claim) return;
    claim.opened = true;
    void supabase
      .rpc("open_letter", { p_letter_id: claim.letterId })
      .then(({ error }) => {
        if (!error) return;
        if (error.message?.includes("not_a_recipient")) {
          letterWithdrawn();
          return;
        }
        return supabase.rpc("open_letter", { p_letter_id: claim.letterId });
      });
  }

  async function fetchLetter() {
    if (!user) return;
    setState({ phase: "loading" });

    // Eligibility (reach cap, hourly pacing, not-own, not-seen) and the
    // random pick all live in the receive_letter() RPC, which claims the
    // delivery atomically — provisionally, until open_letter confirms it.
    const { data, error } = await supabase.rpc("receive_letter");

    if (error || !data || data.length === 0) {
      setState({ phase: "empty" });
      return;
    }

    const row = data[0];

    // The reader backed out while the claim was in flight — the unmount
    // cleanup already ran with nothing to release, so give the slot back
    // here instead of stranding it until the reaper.
    if (!mountedRef.current) {
      void supabase.rpc("release_letter", { p_letter_id: row.id });
      return;
    }

    claimRef.current = { letterId: row.id, opened: false };
    const letter: LetterWithAuthor = {
      ...row,
      author: {
        nickname: row.author_nickname,
        accepts_requests: row.author_accepts_requests,
      },
    };

    setState({ phase: "ready", letter, reaction: "none" });
  }

  // Shared by the swipe commit and the button fallbacks. Returns whether
  // the reaction actually landed, so a flung card can spring back on error.
  async function react(kind: Exclude<Reaction, "none">): Promise<boolean> {
    if (state.phase !== "ready" || state.reaction !== "none") return false;
    Haptics.impactAsync(
      kind === "liked" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy
    );
    const rpc = kind === "liked" ? "like_letter" : "dislike_letter";
    const { error } = await supabase.rpc(rpc, { p_letter_id: state.letter.id });
    if (error) {
      if (error.message?.includes("not_a_recipient")) {
        letterWithdrawn();
        return false;
      }
      Alert.alert("Klaida", error.message);
      return false;
    }
    if (kind === "liked") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setState({ ...state, reaction: kind });
    return true;
  }

  // dir: 1 = right (forward to someone new), -1 = left (graveyard).
  function commitSwipe(dir: 1 | -1) {
    const kind = dir === 1 ? "liked" : "disliked";
    if (reducedMotion) {
      swipeCommitting.value = false;
      cardX.value = 0;
      cardY.value = 0;
      void react(kind);
      return;
    }
    cardX.value = withTiming(dir * width * 1.3, {
      duration: 280,
      easing: Easing.out(Easing.quad),
    });
    cardY.value = withTiming(cardY.value + 48, { duration: 280 });
    react(kind).then((ok) => {
      swipeCommitting.value = false;
      if (!ok) {
        cardX.value = withSpring(0, { damping: 18, stiffness: 200 });
        cardY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }
    });
  }

  const swipeEnabled =
    state.phase === "ready" &&
    state.reaction === "none" &&
    introDone &&
    !showRequestForm;

  const cardPan = Gesture.Pan()
    .enabled(swipeEnabled)
    // Horizontal intent activates the swipe; a mostly-vertical drag fails
    // over to the letter body's own ScrollView so long letters stay readable.
    .activeOffsetX([-16, 16])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      if (swipeCommitting.value) return;
      cardX.value = e.translationX;
      cardY.value = e.translationY * 0.2;
    })
    .onEnd((e) => {
      if (swipeCommitting.value) return;
      const dragged = Math.abs(cardX.value);
      const fastFlick =
        Math.abs(e.velocityX) > SWIPE_FLICK_VELOCITY &&
        dragged > SWIPE_FLICK_MIN_DRAG &&
        // The flick must agree with the drag direction — a drag right
        // released while jerking left is a hesitation, not a commit.
        e.velocityX * cardX.value > 0;
      if (dragged > width * SWIPE_COMMIT_FRACTION || fastFlick) {
        swipeCommitting.value = true;
        runOnJS(commitSwipe)(cardX.value > 0 ? 1 : -1);
        return;
      }
      cardX.value = withSpring(0, { damping: 18, stiffness: 200 });
      cardY.value = withSpring(0, { damping: 18, stiffness: 200 });
    });

  async function handleReport(reason: string) {
    if (state.phase !== "ready") return;
    const { error } = await supabase.rpc("report_letter", {
      p_letter_id: state.letter.id,
      p_reason: reason,
    });
    if (error) { Alert.alert("Klaida", error.message); return; }
    Alert.alert("Ačiū", "Praneštas laiškelis pašalintas iš apyvartos, kol jį peržiūrės administratorius.");
    router.back();
  }

  function confirmReport() {
    if (state.phase !== "ready") return;
    Alert.alert(
      "Pranešti apie laiškelį?",
      "Laiškelis bus iškart pašalintas iš apyvartos, kol jį peržiūrės administratorius.",
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error.code === "23505") {
        Alert.alert("Leidimo jau prašyta", "Jau išsiuntei užklausą susisiekti su siuntėju.");
      } else if (error.message?.includes("conversation_exists")) {
        // Deliberately doesn't say who — the letter is anonymous-ish, and
        // naming the author here would deanonymize their other letters.
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
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel="Uždaryti"
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.emptyTitle}>Kol kas jokių laiškelių</Text>
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
        <TouchableOpacity
          onPress={handleClose}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel="Uždaryti laiškelį"
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.from}>nuo {letter.author?.nickname ?? "nepažįstamasis"}</Text>
        <TouchableOpacity
          onPress={confirmReport}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel="Pranešti apie laiškelį"
          accessibilityHint="Laiškelis bus iškart pašalintas iš apyvartos, kol jį peržiūrės administratorius"
        >
          <Ionicons name="flag-outline" size={22} color={colors.subtext} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {reaction === "none" ? (
          <View style={s.cardArea}>
            <GestureDetector gesture={cardPan}>
              <Animated.View style={[s.card, cardStyle]}>
                <ScrollView style={s.cardScroll} contentContainerStyle={s.cardScrollContent}>
                  {letter.body.trim().length > 0 && (
                    <Text style={s.body}>{letter.body}</Text>
                  )}
                  {/* Words then picture, the same order they came out of the
                      envelope in. */}
                  {letter.drawing && (
                    <View style={s.drawingWrap}>
                      <DrawingView
                        drawing={letter.drawing}
                        size={Math.min(width - 96, 300)}
                      />
                    </View>
                  )}
                </ScrollView>

                <Animated.View style={[s.badge, s.likeBadge, likeBadgeStyle]} pointerEvents="none">
                  <Ionicons name="heart" size={20} color={colors.accent} />
                  <Text style={s.likeBadgeText}>Persiųsti kitam</Text>
                </Animated.View>

                <Animated.View style={[s.badge, s.dislikeBadge, dislikeBadgeStyle]} pointerEvents="none">
                  <MaterialCommunityIcons name="grave-stone" size={20} color={colors.subtext} />
                  <Text style={s.dislikeBadgeText}>Į kapines</Text>
                </Animated.View>
              </Animated.View>
            </GestureDetector>
          </View>
        ) : (
          <Animated.View style={s.resultArea} entering={reducedMotion ? undefined : FadeIn.duration(250)}>
            {reaction === "liked" ? (
              <>
                <Ionicons name="heart" size={40} color={colors.accent} />
                <Text style={s.resultTitle}>Persiųstas kitam</Text>
                <Text style={s.resultHint}>Laiškelis keliauja pas naują nepažįstamąjį.</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="grave-stone" size={40} color={colors.subtext} />
                <Text style={s.resultTitle}>Iškeliavo į kapines</Text>
                <Text style={s.resultHint}>Trys tokie balsai — ir laiškelis baigia kelionę.</Text>
              </>
            )}
          </Animated.View>
        )}

        <Animated.View
          style={[s.actions, actionsStyle]}
          pointerEvents={introDone ? "auto" : "none"}
        >
          {introDone && (
            <TutorialTip
              id="receive_actions_intro"
              text="Jei laiškelis patiko, brauk jį dešinėn ir jis keliaus pas kitą gavėją. Jei jis dėmesio nevertas, brauk kairėn, ir siųsim jį į kapines. Jei nori pabendrauti su autoriumi, gali nusiųsti užklausą."
            />
          )}

          {/* Tap fallbacks for the swipe (and the only path with reduced
              motion or screen readers) — same actions, same labels. */}
          {reaction === "none" && (
            <>
              <View style={s.reactionRow}>
                <TouchableOpacity
                  style={[s.reactionButton, s.dislikeButton]}
                  onPress={() => commitSwipe(-1)}
                  activeOpacity={0.7}
                  accessibilityLabel="Į kapines"
                >
                  <MaterialCommunityIcons name="grave-stone" size={20} color={colors.text} />
                  <Text style={s.dislikeText}>Į kapines</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.reactionButton, s.likeButton]}
                  onPress={() => commitSwipe(1)}
                  activeOpacity={0.7}
                  accessibilityLabel="Persiųsti kitam"
                >
                  <Ionicons name="heart-outline" size={22} color={colors.accent} />
                  <Text style={s.likeText}>Persiųsti kitam</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.swipeHint}>Brauk laiškelį į šoną arba spausk mygtuką</Text>
            </>
          )}

          {/* Request to talk */}
          {canRequest && !showRequestForm && !requestSent && (
            <TouchableOpacity
              style={s.requestButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowRequestForm(true);
              }}
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
                  style={[s.cancelButton, largeTouchTargets && s.cancelButtonLarge]}
                  onPress={() => { setShowRequestForm(false); setGreeting(""); }}
                >
                  <Text style={s.cancelText}>Atšaukti</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.sendGreetingButton, largeTouchTargets && s.sendGreetingButtonLarge, (!greeting.trim() || sendingRequest) && s.disabledButton]}
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
        <Animated.View style={s.introOverlay} exiting={FadeOut.duration(reducedMotion ? 1 : 400)}>
          <EnvelopeLetter
            body={letter.body}
            drawing={letter.drawing}
            mode="receive"
            onDone={handleIntroDone}
            onPulling={() => {
              whiteFade.value = withTiming(1, { duration: reducedMotion ? 1 : 500 });
            }}
          />
          <Animated.View
            style={[StyleSheet.absoluteFillObject, s.whiteFlash, whiteStyle]}
            pointerEvents="none"
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
    closeBtn: { position: "absolute", top: 72, left: 16, zIndex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      // A little extra headroom so the close button sits comfortably below
      // the very top edge instead of crowding the status bar.
      paddingTop: 28,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    from: { fontSize: 14, color: colors.subtext, fontStyle: "italic" },
    cardArea: { flex: 1, padding: 16 },
    card: {
      flex: 1,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      borderCurve: "continuous",
      overflow: "hidden",
    },
    cardScroll: { flex: 1 },
    cardScrollContent: { padding: 24, paddingTop: 28 },
    body: { fontSize: 18, color: colors.text, lineHeight: 30 },
    drawingWrap: { alignItems: "center", marginTop: 20 },
    badge: {
      position: "absolute",
      top: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 2,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
    },
    likeBadge: { left: 16, borderColor: colors.accent, transform: [{ rotateZ: "-8deg" }] },
    likeBadgeText: { fontSize: 15, fontWeight: "700", color: colors.accent },
    dislikeBadge: { right: 16, borderColor: colors.subtext, transform: [{ rotateZ: "8deg" }] },
    dislikeBadgeText: { fontSize: 15, fontWeight: "700", color: colors.subtext },
    resultArea: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
    resultTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
    resultHint: { fontSize: 14, color: colors.subtext, textAlign: "center" },
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
    dislikeText: { fontSize: 15, color: colors.text, fontWeight: "600" },
    swipeHint: { fontSize: 12, color: colors.subtext, textAlign: "center" },
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
      minHeight: 80,
      textAlignVertical: "top",
      ...outlineOver(colors, colors.border),
    },
    greetingRow: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
    cancelButton: { paddingHorizontal: 16, paddingVertical: 10 },
    cancelButtonLarge: LARGE_BUTTON,
    cancelText: { color: colors.subtext, fontSize: 15 },
    sendGreetingButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingHorizontal: 20,
      paddingVertical: 10,
      ...outlineOnly(colors),
    },
    sendGreetingButtonLarge: LARGE_BUTTON,
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
    whiteFlash: { backgroundColor: "#fff" },
  });
}
