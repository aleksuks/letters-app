import { pickBackground } from "@/components/animated-splash";
import { useTheme } from "@/contexts/theme";
import { useAccessibility } from "@/contexts/accessibility";
import { useSound, useScrubSound } from "@/hooks/use-sound";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type Props = {
  body: string;
  mode: "send" | "receive";
  onDone: () => void;
  /** Fired the moment the user swipes/taps to kick off the fold-and-send / reveal ceremony. */
  onStart?: () => void;
};

// waitingToFold / waitingToOpen are the swipe-gated pauses: the sheet holds
// still, an inviting prompt pulses, and nothing proceeds until the user
// swipes it (or taps it, as a fallback). Every other phase is the ceremony
// playing out on its own.
type Phase =
  | "waitingToFold"
  | "folding"
  | "launching"
  | "arriving"
  | "waitingToOpen"
  | "opening"
  | "done";

// How far (px) the finger has to travel to take the fold from fully open
// to fully folded (or vice versa) — the drag maps 1:1 onto fold progress,
// so dragging halfway folds it halfway, and reversing mid-drag unfolds it
// again in real time.
const FOLD_DRAG_DISTANCE = 150;
// Effectively "never" for the wrong-direction bound of activeOffsetY, so
// the pan only ever activates for the one direction that matters per mode.
const NEVER = 100000;
// Progress units per second the fold is allowed to visually travel — a
// hard ceiling so a fast flick still eases through the fold (minimum ~0.5s
// end to end) instead of teleporting straight to folded/open, which reads
// as glitchy rather than physical.
const MAX_FOLD_SPEED = 2;

/**
 * A letter sheet that folds in half and flies away (mode="send"), or
 * arrives folded from the bottom of the screen and unfolds to reveal the
 * text (mode="receive"). The real letter text is visible on the paper
 * throughout the fold. The physical beat of the ceremony (fold+launch, or
 * land+unfold) only plays once the user taps the sheet, so sending and
 * receiving both feel like something the user does, not something that
 * just happens on screen. Calls onDone when the full sequence finishes;
 * haptics fire at the arrive/fold/land/launch beats, alongside a whoosh
 * sound on launch and a chime on arrival.
 */
export function FoldingLetter({ body, mode, onDone, onStart }: Props) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibility();
  const playSend = useSound(require("@/assets/sounds/send.wav"));
  const playReceive = useSound(require("@/assets/sounds/receive.wav"));
  const tear = useScrubSound(require("@/assets/sounds/tear.wav"));
  const { width, height } = useWindowDimensions();
  const [splashTexture] = useState(pickBackground);
  const [fontsLoaded] = useFonts({
    SueEllen: require("@/assets/fonts/SueEllenFrancisco-Regular.ttf"),
  });
  const [phase, setPhase] = useState<Phase>(
    mode === "send" ? "waitingToFold" : "arriving"
  );
  // Lets an extraordinarily long letter be read in full, since the sheet
  // itself stays ellipsis-clipped even at its tallest allowed height.
  const [expanded, setExpanded] = useState(false);

  const SHEET_W = Math.min(Math.round(width * 0.82), 340);
  const SHEET_PADDING = 18;

  // Longer letters get a smaller font (within limits) first, then a taller
  // sheet — growing the box before shrinking type further. Letters that
  // still don't fit even at the tallest sheet stay ellipsis-clipped on the
  // paper itself, but become "openable" via a corner button that reveals
  // the full text in a scrollable modal (see `overflowing` below).
  const fontSize = Math.round(
    Math.max(12, Math.min(15, 15 - (Math.max(0, body.length - 300) / 700) * 3)) * 10
  ) / 10;
  const lineHeight = Math.round(fontSize * 1.6);
  const innerWidth = SHEET_W - SHEET_PADDING * 2;
  const charsPerLine = Math.max(4, Math.floor(innerWidth / (fontSize * 0.55)));
  const estimatedLines = body
    .split("\n")
    .reduce((total, para) => total + Math.max(1, Math.ceil(para.length / charsPerLine)), 0);
  const naturalHalf = estimatedLines * lineHeight + SHEET_PADDING * 2;

  const MIN_HALF = Math.round((SHEET_W * 1.25) / 2);
  const MAX_HALF = Math.round(Math.min(height * 0.62, 560) / 2);
  const HALF = Math.round(Math.min(MAX_HALF, Math.max(MIN_HALF, naturalHalf)));
  const SHEET_H = HALF * 2;
  const maxLines = Math.max(1, Math.floor((HALF - SHEET_PADDING * 2) / lineHeight));
  const overflowing = estimatedLines > maxLines;

  // Reduced motion keeps the same fold/travel/haptic sequence (so onDone
  // still fires and state stays consistent) but compresses every duration
  // and delay to next-to-nothing, so the ceremony reads as an instant
  // cut instead of a multi-second physical motion.
  const d = (ms: number) => (reducedMotion ? 1 : ms);

  // fold: 0 = sheet open flat, 1 = folded in half (paper back showing)
  // travel: 0 = resting in view, 1 = off-screen (top for send, bottom for receive)
  const fold = useSharedValue(mode === "send" ? 0 : 1);
  const travel = useSharedValue(mode === "send" ? 0 : 1);
  // Opacity of the "swipe me" prompt: pulses while waiting, snapped to 0
  // the instant the user acts on it.
  const invite = useSharedValue(0);
  // Set the instant a live drag completes the fold, so a stray onUpdate
  // firing in the gap before the next render disables the gesture can't
  // stomp on fold.value after the ceremony has already taken over.
  const committing = useSharedValue(false);
  const midpointTicked = useSharedValue(false);
  const lastTearProgress = useSharedValue(0);

  function haptic(style: Haptics.ImpactFeedbackStyle) {
    Haptics.impactAsync(style);
  }

  function startInvite() {
    if (reducedMotion) {
      invite.value = 1;
      return;
    }
    invite.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }

  // Launch escalates in intensity as the letter shrinks and fades away —
  // a light push, a firmer send-off, then a strong final buzz right as it
  // vanishes, so the haptic build mirrors the visual one.
  function launch() {
    setPhase("launching");
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    playSend();
    const flightDelay = d(150);
    const flightDuration = d(650);
    setTimeout(
      () => haptic(Haptics.ImpactFeedbackStyle.Heavy),
      flightDelay + Math.round(flightDuration * 0.55)
    );
    travel.value = withDelay(
      flightDelay,
      withTiming(
        1,
        { duration: flightDuration, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(finishSend)();
        }
      )
    );
  }

  function finishSend() {
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
    setPhase("done");
    onDone();
  }

  // Fires once the fold is complete, either handed off from a live drag
  // that already carried fold.value to 1 (fromDrag), or driven by its own
  // canned animation for the tap fallback (which has no drag to follow).
  function commitSend(fromDrag: boolean) {
    if (phase !== "waitingToFold") return;
    setPhase("folding");
    invite.value = withTiming(0, { duration: 150 });
    onStart?.();
    if (fromDrag) {
      fold.value = 1;
      launch();
      return;
    }
    haptic(Haptics.ImpactFeedbackStyle.Light);
    tear.play();
    fold.value = withDelay(
      d(120),
      withTiming(
        1,
        { duration: d(550), easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(launch)();
        }
      )
    );
  }

  function finishOpen() {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setPhase("done");
    onDone();
  }

  // Mirror of commitSend: fromDrag means the user's own finger already
  // carried fold.value down to 0, so the reveal is already done.
  function commitReveal(fromDrag: boolean) {
    if (phase !== "waitingToOpen") return;
    setPhase("opening");
    invite.value = withTiming(0, { duration: 150 });
    onStart?.();
    if (fromDrag) {
      fold.value = 0;
      // A one-motion drag reaches completion the instant the finger
      // releases, with no settle animation like the tap path has — left
      // alone, finishOpen()'s onDone() would unmount this screen (and its
      // audio player) immediately, cutting the still-playing tear off
      // mid-sound instead of letting it finish.
      setTimeout(finishOpen, tear.remainingMs());
      return;
    }
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    tear.play();
    fold.value = withDelay(
      d(120),
      withTiming(
        0,
        { duration: d(550), easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(finishOpen)();
        }
      )
    );
  }

  function arrive() {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setPhase("waitingToOpen");
    startInvite();
  }

  // Mirror image of launch(): starts with the strongest buzz as the letter
  // materializes and fades in, easing down to a gentle settle on arrival —
  // the reverse build of the send-off.
  function beginArrival() {
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
    playReceive();
    const flightDuration = d(650);
    setTimeout(
      () => haptic(Haptics.ImpactFeedbackStyle.Medium),
      Math.round(flightDuration * 0.5)
    );
    travel.value = withTiming(
      0,
      { duration: flightDuration, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(arrive)();
      }
    );
  }

  function commitFromTap() {
    if (mode === "send") commitSend(false);
    else commitReveal(false);
  }

  function commitFromDrag() {
    if (mode === "send") commitSend(true);
    else commitReveal(true);
  }

  const interactive = phase === "waitingToFold" || phase === "waitingToOpen";
  const restFold = mode === "send" ? 0 : 1;

  const tapGesture = Gesture.Tap()
    .enabled(interactive)
    .onEnd(() => {
      runOnJS(commitFromTap)();
    });

  // Drives fold.value off the finger — no separate drag offset or overall
  // sheet translation, just the fold itself tracking the gesture so it can
  // be partially folded and pulled back open again. The finger sets a
  // *target*, but fold.value eases toward it capped at MAX_FOLD_SPEED, so a
  // fast flick still visibly folds through instead of teleporting.
  const panGesture = Gesture.Pan()
    .enabled(interactive)
    .activeOffsetY(mode === "send" ? [-10, NEVER] : [-NEVER, 10])
    .onStart(() => {
      midpointTicked.value = false;
      lastTearProgress.value = fold.value;
    })
    .onUpdate((e) => {
      if (committing.value) return;
      const target =
        mode === "send"
          ? Math.min(1, Math.max(0, -e.translationY) / FOLD_DRAG_DISTANCE)
          : Math.min(1, Math.max(0, 1 - e.translationY / FOLD_DRAG_DISTANCE));

      // Tear advances while the flap is being peeled further and holds the
      // instant that reverses — `target` is fold-progress (1 = folded/
      // closed), which runs opposite to "peeled further" for receive mode
      // (peeling *opens* it, driving fold down from 1 to 0), so the
      // direction check is flipped per mode.
      const peelingFurther =
        mode === "send" ? target > lastTearProgress.value : target < lastTearProgress.value;
      const peelingBack =
        mode === "send" ? target < lastTearProgress.value : target > lastTearProgress.value;
      if (peelingFurther) runOnJS(tear.advance)();
      else if (peelingBack) runOnJS(tear.hold)();
      lastTearProgress.value = target;

      const pastMidpoint = mode === "send" ? target > 0.5 : target < 0.5;
      if (pastMidpoint && !midpointTicked.value) {
        midpointTicked.value = true;
        runOnJS(haptic)(Haptics.ImpactFeedbackStyle.Light);
      } else if (!pastMidpoint && midpointTicked.value) {
        midpointTicked.value = false;
      }

      const reachesEnd = mode === "send" ? target >= 1 : target <= 0;
      const duration = (Math.abs(target - fold.value) / MAX_FOLD_SPEED) * 1000;
      fold.value = withTiming(
        target,
        { duration, easing: Easing.linear },
        (finished) => {
          if (finished && reachesEnd && !committing.value) {
            committing.value = true;
            runOnJS(haptic)(Haptics.ImpactFeedbackStyle.Medium);
            runOnJS(commitFromDrag)();
          }
        }
      );
    })
    .onEnd((e) => {
      if (committing.value) return;
      const target =
        mode === "send"
          ? Math.min(1, Math.max(0, -e.translationY) / FOLD_DRAG_DISTANCE)
          : Math.min(1, Math.max(0, 1 - e.translationY / FOLD_DRAG_DISTANCE));
      // Finger already carried it to completion — let the speed-capped
      // animation already in flight finish and commit itself.
      if (mode === "send" ? target >= 1 : target <= 0) return;
      // Released before finishing the fold — spring back open (send) or
      // back closed (receive), i.e. cancel. The tear sticks back down too,
      // reset to the start so the next attempt tears fresh from silence.
      runOnJS(tear.reset)();
      fold.value = withSpring(restFold, { damping: 16, stiffness: 220 });
    });

  const swipeGesture = Gesture.Race(tapGesture, panGesture);

  useEffect(() => {
    if (mode === "receive") {
      beginArrival();
    } else {
      startInvite();
    }
    // Deliberately mount-once: reducedMotion is captured via the d() closure
    // above, and re-running this effect on a later toggle would restart an
    // already in-flight ceremony.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promptStyle = useAnimatedStyle(() => ({
    opacity: invite.value,
  }));

  const containerStyle = useAnimatedStyle(() => {
    const t = travel.value;
    if (mode === "send") {
      // Fades away over the back half of the flight as it shrinks into
      // the distance.
      return {
        opacity: interpolate(t, [0, 0.5, 1], [1, 1, 0]),
        transform: [
          { translateY: interpolate(t, [0, 1], [0, -height * 0.9]) },
          { rotateZ: `${interpolate(t, [0, 1], [0, 8])}deg` },
          { scale: interpolate(t, [0, 1], [1, 0.45]) },
        ],
      };
    }
    // Mirror image of send: fades in from nothing over the front half of
    // the incoming flight, then holds fully visible into the landing.
    return {
      opacity: interpolate(t, [1, 0.5, 0], [0, 1, 1]),
      transform: [
        { translateY: interpolate(t, [0, 1], [0, height * 0.85]) },
        { rotateZ: `${interpolate(t, [0, 1], [0, -5])}deg` },
        { scale: interpolate(t, [0, 1], [1, 0.9]) },
      ],
    };
  });

  // The bottom half of the sheet rotates up around the fold line (its own
  // top edge), like folding a real letter. Pivoting on the edge instead of
  // the center is done with the translate-rotate-translate sandwich.
  //
  // RN has no preserve-3d, so a pre-rotated face nested inside a rotating
  // parent does not reliably compute backface visibility. Instead, front
  // and back are siblings, each carrying the full fold transform; the back
  // face appends its own 180° flip so it becomes front-facing (and reads
  // upright, over the top half) once the fold passes 90°.
  const bottomFrontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1400 },
      { translateY: -HALF / 2 },
      { rotateX: `${interpolate(fold.value, [0, 1], [0, 180])}deg` },
      { translateY: HALF / 2 },
    ],
  }));

  const bottomBackStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1400 },
      { translateY: -HALF / 2 },
      { rotateX: `${interpolate(fold.value, [0, 1], [0, 180])}deg` },
      { translateY: HALF / 2 },
      { rotateX: "180deg" },
    ],
  }));

  // While the folded sheet travels (arrival and flight), the perspective /
  // rotateX transforms on the flap faces force offscreen rasterization that
  // blurs as the container moves. So once the fold is complete, the 3D
  // faces are swapped for a pixel-identical static flat panel, and swapped
  // back the moment the fold reopens.
  const foldingFacesStyle = useAnimatedStyle(() => ({
    opacity: fold.value > 0.999 ? 0 : 1,
  }));

  const foldedFlatStyle = useAnimatedStyle(() => ({
    opacity: fold.value > 0.999 ? 1 : 0,
  }));

  // The white top-half sheet has square corners at the fold line, so its
  // corners would peek out around the folded panel's rounded corners while
  // traveling. It is fully covered when folded, so hide it entirely then.
  const topHalfStyle = useAnimatedStyle(() => ({
    opacity: fold.value > 0.999 ? 0 : 1,
  }));

  // Text lives on the top half only — the bottom half stays blank paper —
  // so it never looks like the letter continues onto the second sheet.
  // Whatever still doesn't fit (see `overflowing` above) is clipped with a
  // trailing "…" rather than spilling anywhere.
  const sheetFace = {
    width: SHEET_W,
    height: HALF,
    padding: SHEET_PADDING,
  } as const;
  const sheetText = (
    <View style={sheetFace}>
      <Text
        style={{
          color: colors.text,
          fontFamily: fontsLoaded ? "SueEllen" : undefined,
          fontSize,
          lineHeight,
        }}
        numberOfLines={maxLines}
        ellipsizeMode="tail"
      >
        {body}
      </Text>
    </View>
  );

  const backFaceContent = (
    <>
      {splashTexture && (
        <Image
          source={splashTexture}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      <Image
        source={require("@/assets/images/logo-frame-1.png")}
        style={{
          width: Math.round(HALF * 0.55),
          height: Math.round(HALF * 0.55),
        }}
        resizeMode="contain"
      />
    </>
  );

  const backFaceLook = {
    overflow: "hidden",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  } as const;

  const promptLabel =
    mode === "send"
      ? "Brūkštelėkite laišką aukštyn, kad sulankstytumėte ir išsiųstumėte"
      : "Brūkštelėkite žemyn, kad atskleistumėte laišką";
  const promptIcon = mode === "send" ? "gesture-swipe-up" : "gesture-swipe-down";

  return (
    <View style={{ alignItems: "center", gap: 20 }}>
      <View style={{ width: SHEET_W, height: SHEET_H }}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View
          style={[{ width: SHEET_W, height: SHEET_H }, containerStyle]}
          accessible={interactive}
          accessibilityRole={interactive ? "button" : undefined}
          accessibilityLabel={interactive ? promptLabel : undefined}
        >
          {/* Top half of the sheet (static while folding, hidden when folded) */}
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                width: SHEET_W,
                height: HALF,
                overflow: "hidden",
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                borderCurve: "continuous",
                zIndex: 1,
              },
              topHalfStyle,
            ]}
          >
            {sheetText}
          </Animated.View>

          {/* Bottom half, front face: blank paper — text lives on the top
              half only, so it folds up around the fold line empty */}
          <Animated.View
            style={[
              {
                position: "absolute",
                top: HALF,
                width: SHEET_W,
                height: HALF,
                overflow: "hidden",
                backfaceVisibility: "hidden",
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                borderCurve: "continuous",
                zIndex: 2,
              },
              bottomFrontStyle,
              foldingFacesStyle,
            ]}
          />

          {/* Bottom half, back face: splash-screen texture with the app logo,
              visible once the fold passes 90 degrees */}
          <Animated.View
            style={[
              {
                position: "absolute",
                top: HALF,
                width: SHEET_W,
                height: HALF,
                backfaceVisibility: "hidden",
                zIndex: 2,
                ...backFaceLook,
              },
              bottomBackStyle,
              foldingFacesStyle,
            ]}
          >
            {backFaceContent}
          </Animated.View>

          {/* Static flat copy of the folded result, shown while traveling so no
              3D transforms are in play (keeps the moving sheet crisp) */}
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                width: SHEET_W,
                height: HALF,
                zIndex: 3,
                ...backFaceLook,
              },
              foldedFlatStyle,
            ]}
            pointerEvents="none"
          >
            {backFaceContent}
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Sits outside the GestureDetector so it doesn't fight the
          fold/reveal swipe — only shown for letters too long to fully fit
          even at the tallest sheet size. */}
      {overflowing && interactive && (
        <TouchableOpacity
          style={[
            styles.expandButton,
            { top: HALF - 38, backgroundColor: colors.bg, borderColor: colors.border },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpanded(true);
          }}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Skaityti visą laišką"
        >
          <MaterialCommunityIcons name="arrow-expand" size={14} color={colors.subtext} />
          <Text style={[styles.expandButtonText, { color: colors.subtext }]}>
            Skaityti visą
          </Text>
        </TouchableOpacity>
      )}
      </View>

      <Animated.View style={[styles.promptRow, promptStyle]} pointerEvents="none">
        <MaterialCommunityIcons name={promptIcon} size={18} color={colors.subtext} />
        <Text style={[styles.promptText, { color: colors.subtext }]}>
          {promptLabel}
        </Text>
      </Animated.View>

      <Modal
        visible={expanded}
        animationType="slide"
        onRequestClose={() => setExpanded(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setExpanded(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Uždaryti"
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text
              style={[
                styles.modalBody,
                { color: colors.text, fontFamily: fontsLoaded ? "SueEllen" : undefined },
              ]}
            >
              {body}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  promptRow: {
    alignItems: "center",
    gap: 6,
    maxWidth: 240,
  },
  promptText: {
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
  },
  expandButton: {
    position: "absolute",
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    zIndex: 4,
  },
  expandButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalScroll: {
    padding: 24,
    paddingTop: 8,
  },
  modalBody: {
    fontSize: 17,
    lineHeight: 27,
  },
});
