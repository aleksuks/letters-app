import { useTheme, outlineOnly, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE, LARGE_BUTTON } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/contexts/profile";
import { supabase } from "@/lib/supabase";
import { Letter } from "@/types";
import { EnvelopeLetter } from "@/components/envelope-letter";
import { DrawingView } from "@/components/drawing-view";
import { TutorialTip } from "@/components/tutorial-tip";
import { useTour } from "@/contexts/tour";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import * as Haptics from "@/lib/haptics";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert,
  BackHandler,
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
import { useStrings, format } from "@/lib/i18n";
import { receiveStrings } from "@/lib/i18n/strings/receive";
import { welcomeLetterStrings } from "@/lib/i18n/strings/welcome-letter";
import { common } from "@/lib/i18n/strings/common";

type LetterWithAuthor = Letter & { author: { nickname: string; accepts_requests: boolean } | null };

type Reaction = "none" | "liked" | "disliked";

type ScreenState =
  | { phase: "loading" }
  | { phase: "empty" }
  | { phase: "ready"; letter: LetterWithAuthor; reaction: Reaction; isWelcome?: boolean };

// How far (fraction of screen width) the card must be dragged before release
// commits the reaction; a fast horizontal flick commits from a shorter drag.
const SWIPE_COMMIT_FRACTION = 0.35;
const SWIPE_FLICK_VELOCITY = 900;
const SWIPE_FLICK_MIN_DRAG = 40;

export default function ReceiveScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { colors } = useTheme();
  const { largeTouchTargets, reducedMotion } = useAccessibility();
  const { width } = useWindowDimensions();
  const t = useStrings(receiveStrings);
  const c = useStrings(common);
  const w = useStrings(welcomeLetterStrings);
  const { welcomeDelivered, markWelcomeDelivered } = useTour();
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

  // The reader must vote (like/dislike) before the letter can go away — no
  // accidental swipe-down-to-dismiss (a keyboard-closing swipe on the
  // greeting field was catching the modal gesture instead) and no Android
  // back button either. Once a reaction is recorded, both are restored.
  const mustDecide = state.phase === "ready" && state.reaction === "none";

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !mustDecide });
  }, [navigation, mustDecide]);

  useEffect(() => {
    if (!mustDecide) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [mustDecide]);

  // Waits for welcomeDelivered to resolve from storage before fetching:
  // treating "not yet known" as "already delivered" would race the premise
  // letter and hand a first-time reader a stranger's letter instead. The ref
  // keeps the fetch to exactly one — marking the welcome delivered flips the
  // flag mid-read, and refetching then would swap the letter under them.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!user || welcomeDelivered === null || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchLetter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, welcomeDelivered]);

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
    if (mustDecide) return;
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
      t.withdrawnTitle,
      t.withdrawnBody,
      [{ text: c.ok, onPress: () => router.back() }]
    );
  }

  function handleIntroDone() {
    setIntroDone(true);
    actionsOpacity.value = withTiming(1, { duration: 250 });

    // The welcome letter has no server-side claim; marking it delivered here
    // (letter actually shown, mirroring open_letter) means backing out
    // mid-ceremony redelivers it next time.
    if (state.phase === "ready" && state.isWelcome) {
      markWelcomeDelivered();
      return;
    }

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

    // First receive ever: deliver the premise letter, entirely client-side.
    // Reactions on it are local (see react()), and it can't be reported or
    // replied to — it's the app talking, not a stranger.
    if (welcomeDelivered === false) {
      const letter = {
        id: "welcome",
        author_id: "",
        body: w.body,
        drawing: null,
        author: { nickname: w.fromNickname, accepts_requests: true },
      } as unknown as LetterWithAuthor;
      setState({ phase: "ready", letter, reaction: "none", isWelcome: true });
      return;
    }

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
    // The welcome letter isn't in the pool — the swipe is a dry run of the
    // real mechanic, so it lands on the same result screen without an RPC.
    if (state.isWelcome) {
      if (kind === "liked") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setState({ ...state, reaction: kind });
      return true;
    }
    const rpc = kind === "liked" ? "like_letter" : "dislike_letter";
    const { error } = await supabase.rpc(rpc, { p_letter_id: state.letter.id });
    if (error) {
      if (error.message?.includes("not_a_recipient")) {
        letterWithdrawn();
        return false;
      }
      Alert.alert(t.errorTitle, error.message);
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
    if (error) { Alert.alert(t.errorTitle, error.message); return; }
    Alert.alert(t.reportThanksTitle, t.reportThanksBody);
    router.back();
  }

  function confirmReport() {
    if (state.phase !== "ready") return;
    Alert.alert(
      t.reportConfirmTitle,
      t.reportConfirmBody,
      [
        { text: c.cancel, style: "cancel" },
        // The reason stored on the report row stays canonical Lithuanian
        // regardless of UI language, matching chat/[id].tsx and
        // map-letter.tsx — the single founder moderator's queue should not
        // fragment by reporter language. Only the button label is translated.
        { text: t.reportReasonContent, onPress: () => handleReport("Netinkamas turinys") },
        { text: t.reportReasonHarassment, onPress: () => handleReport("Priekabiavimas ar grasinimai") },
      ]
    );
  }

  // Moderator-only escape hatch (migration 044): permanent, straight-away
  // delete, independent of the report/review pipeline above.
  function confirmModeratorDelete() {
    if (state.phase !== "ready") return;
    const letterId = state.letter.id;
    Alert.alert(
      "Delete permanently?",
      "This deletes the letter outright — no review queue, no undo.",
      [
        { text: c.cancel, style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            claimRef.current = null;
            const { error } = await supabase.from("letters").delete().eq("id", letterId);
            if (error) { Alert.alert(t.errorTitle, error.message); return; }
            router.back();
          },
        },
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
        Alert.alert(t.alreadyRequestedTitle, t.alreadyRequestedBody);
      } else if (error.message?.includes("conversation_exists")) {
        // Deliberately doesn't say who — the letter is anonymous-ish, and
        // naming the author here would deanonymize their other letters.
        Alert.alert(t.conversationExistsTitle, t.conversationExistsBody);
      } else if (error.code === "42501") {
        Alert.alert(t.requestsClosedTitle, t.requestsClosedBody);
      } else {
        Alert.alert(t.errorTitle, error.message);
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
          accessibilityLabel={t.close}
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.emptyTitle}>{t.emptyTitle}</Text>
          <Text style={s.emptyHint}>
            {t.emptyHint}
          </Text>
          <TouchableOpacity style={s.emptyButton} onPress={() => router.back()}>
            <Text style={s.emptyButtonText}>{t.emptyButton}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { letter, reaction, isWelcome } = state;
  const canRequest = !isWelcome && letter.author?.accepts_requests !== false;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={handleClose}
          disabled={mustDecide}
          style={mustDecide ? s.closeDisabled : undefined}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel={t.closeLetter}
          accessibilityState={{ disabled: mustDecide }}
        >
          <Ionicons name="close" size={28} color={mustDecide ? colors.border : colors.text} />
        </TouchableOpacity>
        <Text style={s.from}>{format(t.from, { nickname: letter.author?.nickname ?? t.unknownAuthor })}</Text>
        <View style={s.headerActions}>
          {profile?.is_moderator && !isWelcome && (
            <TouchableOpacity
              onPress={confirmModeratorDelete}
              hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
              accessibilityRole="button"
              accessibilityLabel="Delete letter"
            >
              <Ionicons name="trash-outline" size={22} color={colors.subtext} />
            </TouchableOpacity>
          )}
          {!isWelcome && (
            <TouchableOpacity
              onPress={confirmReport}
              hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
              accessibilityRole="button"
              accessibilityLabel={t.reportLabel}
              accessibilityHint={t.reportHint}
            >
              <Ionicons name="flag-outline" size={22} color={colors.subtext} />
            </TouchableOpacity>
          )}
        </View>
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
                  <Text style={s.likeBadgeText}>{t.likeBadge}</Text>
                </Animated.View>

                <Animated.View style={[s.badge, s.dislikeBadge, dislikeBadgeStyle]} pointerEvents="none">
                  <MaterialCommunityIcons name="grave-stone" size={20} color={colors.subtext} />
                  <Text style={s.dislikeBadgeText}>{t.dislikeBadge}</Text>
                </Animated.View>
              </Animated.View>
            </GestureDetector>
          </View>
        ) : (
          <Animated.View style={s.resultArea} entering={reducedMotion ? undefined : FadeIn.duration(250)}>
            {reaction === "liked" ? (
              <>
                <Ionicons name="heart" size={40} color={colors.accent} />
                <Text style={s.resultTitle}>{t.resultLikedTitle}</Text>
                <Text style={s.resultHint}>{t.resultLikedHint}</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="grave-stone" size={40} color={colors.subtext} />
                <Text style={s.resultTitle}>{t.resultDislikedTitle}</Text>
                <Text style={s.resultHint}>{t.resultDislikedHint}</Text>
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
              text={t.actionsTip}
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
                  accessibilityLabel={t.dislikeBadge}
                >
                  <MaterialCommunityIcons name="grave-stone" size={20} color={colors.text} />
                  <Text style={s.dislikeText}>{t.dislikeBadge}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.reactionButton, s.likeButton]}
                  onPress={() => commitSwipe(1)}
                  activeOpacity={0.7}
                  accessibilityLabel={t.likeBadge}
                >
                  <Ionicons name="heart-outline" size={22} color={colors.accent} />
                  <Text style={s.likeText}>{t.likeBadge}</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.swipeHint}>{t.swipeHint}</Text>
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
              <Text style={s.requestText}>{t.requestButton}</Text>
            </TouchableOpacity>
          )}

          {!isWelcome && !canRequest && !requestSent && (
            <Text style={s.requestClosedText}>{t.requestClosed}</Text>
          )}

          {showRequestForm && (
            <View style={s.greetingForm}>
              <TextInput
                style={s.greetingInput}
                value={greeting}
                onChangeText={setGreeting}
                placeholder={t.greetingPlaceholder}
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
                  <Text style={s.cancelText}>{c.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.sendGreetingButton, largeTouchTargets && s.sendGreetingButtonLarge, (!greeting.trim() || sendingRequest) && s.disabledButton]}
                  onPress={handleSendRequest}
                  disabled={!greeting.trim() || sendingRequest}
                >
                  {sendingRequest
                    ? <ActivityIndicator color={colors.accentText} size="small" />
                    : <Text style={s.sendGreetingText}>{t.sendGreeting}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {requestSent && (
            <View style={s.sentRow}>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              <Text style={s.sentText}>{t.requestSent}</Text>
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
    closeDisabled: { opacity: 0.35 },
    from: { fontSize: 14, color: colors.subtext, fontStyle: "italic" },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
    cardArea: { flex: 1, padding: 16 },
    card: {
      flex: 1,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 18,
      borderCurve: "continuous",
      overflow: "hidden",
      ...outlineOver(colors, colors.border),
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
