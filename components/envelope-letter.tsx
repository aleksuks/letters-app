import { useTheme } from "@/contexts/theme";
import { useAccessibility } from "@/contexts/accessibility";
import { useSound, useScrubSound } from "@/hooks/use-sound";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Line, Path, Rect } from "react-native-svg";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  SharedValue,
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
  /** Fired the moment the user commits to actually sending the envelope away. */
  onStart?: () => void;
  /** Receive only: fired the moment the final pull-free swipe commits, so the
   * host screen can start a full-screen transition (e.g. fade to white)
   * timed to the letter's last upward motion instead of cutting in only
   * once `onDone` fires. */
  onPulling?: () => void;
};

// The ceremony is a sequence of automatic beats (the envelope/letter moving
// on its own) and gestured beats (waitingToX, where a pulsing prompt waits
// for a swipe or tap). Send: the letter slides itself down into an
// already-open envelope, the user swipes down to close the flap, then up to
// send it away. Receive: a sealed envelope arrives, the user swipes up to
// tear it open, the letter pops up on its own, then a second swipe up pulls
// it free.
type Phase =
  | "entering"
  | "waitingToClose"
  | "closing"
  | "waitingToSend"
  | "launching"
  | "arriving"
  | "waitingToOpen"
  | "opening"
  | "peeking"
  | "waitingToPull"
  | "pulling"
  | "done";

// How far (px) a finger has to travel to carry a gestured stage (closing,
// opening, sending, pulling) from its resting value to its target — the
// drag maps 1:1 onto progress, so dragging halfway gets it halfway there,
// and reversing mid-drag backs it off again in real time.
const DRAG_DISTANCE = 110;
// Effectively "never" for the wrong-direction bound of activeOffsetY, so a
// pan only ever activates for the one direction that matters per stage.
const NEVER = 100000;
// Progress units per second a drag-driven value is allowed to visually
// travel — high enough that ordinary drags (even fast ones) still read as
// direct 1:1 finger tracking, but a near-instantaneous jump (a full swipe
// registered within a single touch event) still gets a barely-perceptible
// floor duration (~140ms for the full 0..1 range) instead of teleporting.
const MAX_DRAG_SPEED = 7;
// px/s of vertical velocity, in the gesture's forward direction, that counts
// as a confident flick — lets a fast swipe commit a stage even if the
// finger let go a little short of the full DRAG_DISTANCE, since natural
// flicks are often shorter *and* faster than a deliberate slow drag.
const FLICK_VELOCITY = 800;

/**
 * Builds the tap-or-drag gesture for one gestured stage of the ceremony
 * (closing the flap, sending it away, opening the flap, pulling the letter
 * out). `value` tracks the finger from `from` to `to` as the user drags
 * (speed-capped only enough to keep a near-instant jump visible); `dragUp`
 * selects which finger direction counts as forward progress. Reaching `to`
 * mid-drag, or releasing early with a fast enough flick, commits
 * automatically; releasing a slow partial drag springs back to `from`. A
 * plain tap is a full-speed fallback for anyone who can't or doesn't want
 * to drag.
 */
function buildDragStage({
  enabled,
  value,
  from,
  to,
  dragUp,
  committing,
  midpointTicked,
  lastProgress,
  onCommit,
  tear,
}: {
  enabled: boolean;
  value: SharedValue<number>;
  from: number;
  to: number;
  dragUp: boolean;
  committing: SharedValue<boolean>;
  midpointTicked: SharedValue<boolean>;
  lastProgress: SharedValue<number>;
  onCommit: (fromDrag: boolean) => void;
  tear?: { advance: () => void; hold: () => void; reset: () => void };
}) {
  const tapGesture = Gesture.Tap()
    .enabled(enabled)
    .onEnd(() => {
      runOnJS(onCommit)(false);
    });

  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetY(dragUp ? [-10, NEVER] : [-NEVER, 10])
    .onStart(() => {
      midpointTicked.value = false;
      lastProgress.value = 0;
    })
    .onUpdate((e) => {
      if (committing.value) return;
      const raw = dragUp ? Math.max(0, -e.translationY) : Math.max(0, e.translationY);
      const t = Math.min(1, raw / DRAG_DISTANCE);
      const target = from + (to - from) * t;

      if (tear) {
        if (t > lastProgress.value) runOnJS(tear.advance)();
        else if (t < lastProgress.value) runOnJS(tear.hold)();
      }
      lastProgress.value = t;

      if (t > 0.5 && !midpointTicked.value) {
        midpointTicked.value = true;
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      } else if (t <= 0.5 && midpointTicked.value) {
        midpointTicked.value = false;
      }

      const duration = (Math.abs(target - value.value) / MAX_DRAG_SPEED) * 1000;
      value.value = withTiming(
        target,
        { duration, easing: Easing.linear },
        (finished) => {
          if (finished && t >= 1 && !committing.value) {
            committing.value = true;
            runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
            runOnJS(onCommit)(true);
          }
        }
      );
    })
    .onEnd((e) => {
      if (committing.value) return;
      const raw = dragUp ? Math.max(0, -e.translationY) : Math.max(0, e.translationY);
      const t = Math.min(1, raw / DRAG_DISTANCE);
      const velocity = dragUp ? -e.velocityY : e.velocityY;

      // A confident, fast flick commits the stage even if the finger let go
      // short of the full drag distance — real swipes are often shorter
      // and faster than a deliberate slow drag, and requiring the full
      // distance made an otherwise-good swipe silently spring back.
      if (t < 1 && t > 0.3 && velocity > FLICK_VELOCITY) {
        committing.value = true;
        if (tear) runOnJS(tear.advance)();
        value.value = withTiming(to, { duration: 90, easing: Easing.out(Easing.quad) });
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        runOnJS(onCommit)(true);
        return;
      }

      if (t >= 1) return;
      if (tear) runOnJS(tear.reset)();
      value.value = withSpring(from, { damping: 16, stiffness: 220 });
    });

  return Gesture.Race(tapGesture, panGesture);
}

/**
 * The envelope ceremony that bookends writing and reading a letter. Send:
 * the letter slides itself into an envelope, the user seals it with a
 * downward swipe and sends it away with an upward one. Receive: a sealed
 * envelope arrives, the user tears it open (upward swipe), the letter pops
 * up on its own, and a second upward swipe pulls it free.
 * Calls onDone when the full sequence finishes; haptics and sound effects
 * mark every beat (send/receive whooshes on flight, a woosh layered in as
 * the letter actually flies away, a scrubbing tear on opening).
 */
export function EnvelopeLetter({ body, mode, onDone, onStart, onPulling }: Props) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibility();
  const playSend = useSound(require("@/assets/sounds/send.wav"));
  const playReceive = useSound(require("@/assets/sounds/receive.wav"));
  const playWoosh = useSound(require("@/assets/sounds/woosh.wav"));
  const tear = useScrubSound(require("@/assets/sounds/tear.wav"));
  const { width, height } = useWindowDimensions();
  const [fontsLoaded] = useFonts({
    SueEllen: require("@/assets/fonts/SueEllenFrancisco-Regular.ttf"),
  });
  const [phase, setPhase] = useState<Phase>(mode === "send" ? "entering" : "arriving");

  const SHEET_W = Math.min(Math.round(width * 0.82), 340);
  const SHEET_PADDING = 18;

  // Longer letters get a smaller font (within limits) first, then a taller
  // sheet — growing the box before shrinking type further. Letters that
  // still don't fit even at the tallest sheet stay ellipsis-clipped; the
  // destination write/reading screens show the full text either side of
  // this purely-ceremonial animation.
  const fontSize = Math.round(
    Math.max(12, Math.min(15, 15 - (Math.max(0, body.length - 300) / 700) * 3)) * 10
  ) / 10;
  const lineHeight = Math.round(fontSize * 1.6);
  const innerWidth = SHEET_W - SHEET_PADDING * 2;
  const charsPerLine = Math.max(4, Math.floor(innerWidth / (fontSize * 0.55)));
  const estimatedLines = body
    .split("\n")
    .reduce((total, para) => total + Math.max(1, Math.ceil(para.length / charsPerLine)), 0);
  const naturalHeight = estimatedLines * lineHeight + SHEET_PADDING * 2;

  // The letter is a single flat sheet (no fold). It must fit fully inside
  // the envelope when tucked, and the envelope is sized from it, so these
  // bounds set the whole composition's proportions. The max is driven
  // primarily off SHEET_W (a fixed aspect ratio) rather than window height,
  // so the envelope reads the same shape on any device — a height-based
  // screen fraction alone made it noticeably squatter on phones with a
  // shorter height-to-width ratio (e.g. many Pixel panels vs iPhone's) even
  // at the same sheet width. height/280 remain as generous safety ceilings
  // for unusually short viewports (landscape, split-screen), not the
  // everyday driver of the shape.
  const MIN_SHEET_H = Math.round(SHEET_W * 0.625);
  const MAX_SHEET_H = Math.round(Math.min(SHEET_W * 0.85, height * 0.45, 300));
  const SHEET_H = Math.round(Math.min(MAX_SHEET_H, Math.max(MIN_SHEET_H, naturalHeight)));
  const maxLines = Math.max(1, Math.floor((SHEET_H - SHEET_PADDING * 2) / lineHeight));

  // Envelope geometry. The envelope sits at the bottom of a taller group box
  // (HEADROOM above it) so the letter's full travel range up to FULLY_OUT_Y
  // stays within the group's own laid-out bounds — a touch outside a native
  // view's frame never reaches it, even for a transformed descendant that's
  // visually rendered there. The group is then shifted up by half that
  // headroom (negative margin) so the envelope itself — not the invisible
  // headroom — ends up sitting at the visual center.
  const ENVELOPE_H = Math.round(SHEET_H * 1.15);
  const FLAP_H = Math.round(ENVELOPE_H * 0.58);
  // The pocket is a little wider than the letter so the paper visibly fits
  // *inside* it rather than sharing its exact silhouette.
  const ENVELOPE_W = SHEET_W + 14;
  const PAPER_LEFT = (ENVELOPE_W - SHEET_W) / 2;
  // "Fully out": the sheet sits above the envelope with just its bottom
  // edge dipping into the mouth, so it still reads as belonging to it.
  const FULLY_OUT_Y = -Math.round(SHEET_H * 0.92);
  const HEADROOM = Math.abs(FULLY_OUT_Y) + 24;
  const GROUP_H = ENVELOPE_H + HEADROOM;
  const ENVELOPE_TOP = HEADROOM;
  // Tucked letters rest on the envelope floor (translateY relative to the
  // paper's laid-out position, which is top: ENVELOPE_TOP): the sheet's
  // bottom edge sits a few px above the pocket's bottom, leaving a sliver
  // of shaded interior visible above it through the mouth notch — that gap
  // is what reads as "a letter sitting inside an envelope".
  const TUCKED_Y = ENVELOPE_H - SHEET_H - 6;

  // Reduced motion keeps the same sequence of beats (so onDone still fires
  // and state stays consistent) but compresses every duration/delay to
  // next-to-nothing, so the ceremony reads as a quick cut instead of a
  // multi-second physical motion.
  const d = (ms: number) => (reducedMotion ? 1 : ms);

  // flap: 0 = open (standing up on its hinge), 1 = closed (sealed over the
  // body, apex pointing down).
  const flap = useSharedValue(mode === "send" ? 0 : 1);
  // slide: 0 = sheet fully out above the envelope, 1 = tucked inside it.
  // Send only, always auto-animated (never finger-scrubbed) — plays 0->1
  // while entering. Receive drives the sheet's position with `emerge`.
  const slide = useSharedValue(mode === "send" ? 0 : 1);
  // emerge: 0 = tucked inside the envelope, 1 = fully pulled out. Receive
  // only; drives the letter's position from "peeking" onward.
  const emerge = useSharedValue(0);
  // travel: 0 = resting in view, 1 = off-screen (top for send, bottom for
  // receive) — drives the whole envelope group flying on/off screen. Also
  // finger-scrubbed a little at the very start of send's launch (see
  // launchGesture below), then finishes automatically.
  const travel = useSharedValue(mode === "send" ? 0 : 1);
  // Opacity of the "swipe me" prompt: pulses while waiting, snapped to 0
  // the instant the user acts on it.
  const invite = useSharedValue(0);
  // Extra px of translateY layered on top of the envelope's normal position
  // — a quick dip-down-and-spring-back "weight" reaction fired the instant
  // the letter finishes settling into the envelope (send: slides in;
  // receive: the envelope itself lands), then eases back to 0.
  const settleBounce = useSharedValue(0);
  // Shared drag-stage bookkeeping, reset at the start of each gestured
  // stage (only one stage is ever enabled at a time).
  const committing = useSharedValue(false);
  const midpointTicked = useSharedValue(false);
  const lastProgress = useSharedValue(0);

  // Dips the envelope down a few px — like it's absorbing the weight of
  // the letter landing inside it — then eases back to rest. `delayMs`
  // lets the caller start this concurrently with the fall/flight
  // animation it's reacting to (timed to land near the end of it) rather
  // than only after that animation fully finishes, so the two read as one
  // connected motion instead of two separate ones played back to back.
  // A plain ease back to 0 (no spring) so the motion is unambiguously
  // down-then-settle — a spring here would underdamp and overshoot past
  // 0, making the *return* bounce upward, which read as if the envelope's
  // first real motion was upward instead of down.
  function playSettleBounce(delayMs: number) {
    if (reducedMotion) return;
    settleBounce.value = withDelay(
      delayMs,
      withSequence(
        withTiming(10, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) })
      )
    );
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

  // ---- SEND ----

  function enterEnvelope() {
    committing.value = false;
    const duration = d(380);
    // No leading delay here (unlike the other auto-beats below): this is
    // the very first thing that runs after the ceremony mounts, and any
    // extra pause on top of ordinary mount cost read as a stall before the
    // letter appeared to do anything.
    slide.value = withTiming(1, { duration, easing: Easing.inOut(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(afterEnter)();
    });
    // Started now, not from afterEnter's completion callback, so the dip
    // overlaps the tail of the fall instead of trailing it once the fall
    // has already fully stopped — timed to land right as the paper
    // reaches the envelope floor, so the two read as one connected "it
    // falls in and thumps" motion rather than two separate ones in a row.
    playSettleBounce(Math.max(0, duration - 90));
  }

  function afterEnter() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase("waitingToClose");
    startInvite();
  }

  function commitClose(fromDrag: boolean) {
    if (phase !== "waitingToClose") return;
    setPhase("closing");
    invite.value = withTiming(0, { duration: 150 });
    if (fromDrag) {
      flap.value = 1;
      closeSettle();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flap.value = withDelay(
      d(70),
      withTiming(1, { duration: d(380), easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(closeSettle)();
      })
    );
  }

  function closeSettle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase("waitingToSend");
    committing.value = false;
    startInvite();
  }

  // fromDrag: the user's own upward drag already carried `travel` to 0.15
  // as a small pre-launch lift; the flight continues on from there instead
  // of restarting. A tap has no such head start, so it gets the usual
  // pre-flight beat before the same flight animation.
  function commitLaunch(fromDrag: boolean) {
    if (phase !== "waitingToSend") return;
    setPhase("launching");
    invite.value = withTiming(0, { duration: 150 });
    onStart?.();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playSend();
    playWoosh();
    const flightDelay = fromDrag ? 0 : d(90);
    const flightDuration = d(450);
    setTimeout(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setPhase("done");
    onDone();
  }

  // ---- RECEIVE ----

  // Mirror image of the send flight: starts with the strongest buzz as the
  // envelope materializes and fades in, easing down to a gentle settle on
  // arrival.
  function beginArrival() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playReceive();
    const flightDuration = d(450);
    setTimeout(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
      Math.round(flightDuration * 0.5)
    );
    travel.value = withTiming(
      0,
      { duration: flightDuration, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(arrive)();
      }
    );
    // Same reasoning as enterEnvelope: started alongside the flight so it
    // overlaps the landing instead of trailing it.
    playSettleBounce(Math.max(0, flightDuration - 90));
  }

  function arrive() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase("waitingToOpen");
    committing.value = false;
    startInvite();
  }

  function commitOpen(fromDrag: boolean) {
    if (phase !== "waitingToOpen") return;
    setPhase("opening");
    invite.value = withTiming(0, { duration: 150 });
    if (fromDrag) {
      flap.value = 0;
      openSettle();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    tear.play();
    flap.value = withDelay(
      d(70),
      withTiming(0, { duration: d(380), easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(openSettle)();
      })
    );
  }

  function openSettle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase("peeking");
    peekOut();
  }

  function peekOut() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    emerge.value = withTiming(
      0.35,
      { duration: d(200), easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(afterPeek)();
      }
    );
  }

  function afterPeek() {
    setPhase("waitingToPull");
    committing.value = false;
    startInvite();
  }

  function commitPull(fromDrag: boolean) {
    if (phase !== "waitingToPull") return;
    setPhase("pulling");
    invite.value = withTiming(0, { duration: 150 });
    onPulling?.();
    if (fromDrag) {
      emerge.value = 1;
      pullSettle();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    emerge.value = withDelay(
      d(50),
      withTiming(1, { duration: d(260), easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(pullSettle)();
      })
    );
  }

  function pullSettle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // The sheet is a single flat page — nothing to unfold. A short settle
    // beat with the letter held free of the envelope, then hand off.
    setTimeout(() => finishOpen(), d(150));
  }

  function finishOpen() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase("done");
    onDone();
  }

  useEffect(() => {
    if (mode === "send") enterEnvelope();
    else beginArrival();
    // Deliberately mount-once: reducedMotion is captured via the d() closure
    // above, and re-running this effect on a later toggle would restart an
    // already in-flight ceremony.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeGesture = buildDragStage({
    enabled: phase === "waitingToClose",
    value: flap,
    from: 0,
    to: 1,
    dragUp: false,
    committing,
    midpointTicked,
    lastProgress,
    onCommit: commitClose,
  });

  // A small upward drag (mapped onto `travel`, 0 -> 0.15) gives a visible
  // pre-launch lift and hands off into the same automatic flight the tap
  // fallback uses — deliberately not a Fling gesture, since Fling requires
  // a fast flick and would silently ignore an ordinary slow swipe.
  const launchGesture = buildDragStage({
    enabled: phase === "waitingToSend",
    value: travel,
    from: 0,
    to: 0.15,
    dragUp: true,
    committing,
    midpointTicked,
    lastProgress,
    onCommit: commitLaunch,
  });

  const openGesture = buildDragStage({
    enabled: phase === "waitingToOpen",
    value: flap,
    from: 1,
    to: 0,
    dragUp: true,
    committing,
    midpointTicked,
    lastProgress,
    onCommit: commitOpen,
    tear,
  });

  const pullGesture = buildDragStage({
    enabled: phase === "waitingToPull",
    value: emerge,
    from: 0.35,
    to: 1,
    dragUp: true,
    committing,
    midpointTicked,
    lastProgress,
    onCommit: commitPull,
  });

  const gesture = Gesture.Race(closeGesture, launchGesture, openGesture, pullGesture);

  const interactive =
    phase === "waitingToClose" ||
    phase === "waitingToSend" ||
    phase === "waitingToOpen" ||
    phase === "waitingToPull";

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
          { translateY: interpolate(t, [0, 1], [0, -height * 0.9]) + settleBounce.value },
          { rotateZ: `${interpolate(t, [0, 1], [0, 8])}deg` },
          { scale: interpolate(t, [0, 1], [1, 0.45]) },
        ],
      };
    }
    // Mirror image of send: fades in from nothing, reaching full opacity
    // well before landing (t=0.7, not the flight's midpoint) so the
    // envelope is clearly visible for most of the approach instead of
    // spending its first half as a barely-there ghost — the low-opacity
    // stretch read as a stall before the arrival "really" started.
    return {
      opacity: interpolate(t, [1, 0.7, 0], [0, 1, 1]),
      transform: [
        { translateY: interpolate(t, [0, 1], [0, height * 0.85]) + settleBounce.value },
        { rotateZ: `${interpolate(t, [0, 1], [0, -5])}deg` },
        { scale: interpolate(t, [0, 1], [1, 0.9]) },
      ],
    };
  });

  // The paper's vertical slot: send slides it from fully-out (readable,
  // above the envelope) down into the pocket; receive holds it tucked
  // until pulled, then carries it fully out. Opacity fades the paper's own
  // sliver-through-the-notch visibility directly off `flap.value`, fully
  // hidden by the time the flap is close enough to flat to read as
  // "closed" and fully back by the time it's far enough open to read as
  // "open". This is simpler and more robust than trying to have the 3D
  // rotateX flap (which foreshortens as it swings, see flapFrontStyle)
  // geometrically occlude the notch itself — that left a gap the paper
  // could show through partway through the swing, and any patch built on
  // top of that geometry was one more moving part to keep in sync. Fading
  // the paper directly needs no such sync: it's invisible well before any
  // rotation-angle gap could expose it.
  const paperSlotStyle = useAnimatedStyle(() => {
    const y =
      mode === "send"
        ? interpolate(slide.value, [0, 1], [FULLY_OUT_Y, TUCKED_Y])
        : interpolate(emerge.value, [0, 1], [TUCKED_Y, FULLY_OUT_Y]);
    const opacity = Math.min(1, interpolate(flap.value, [0.5, 1], [1, 0]));
    return { opacity, transform: [{ translateY: y }] };
  });

  // The flap rotates on a hinge along the envelope's top edge, from sealed
  // (apex down over the mouth, 0deg) to standing fully open above the
  // pocket (180deg, apex up) — visible in both rest states, like a real
  // envelope flap. Two single-faced copies fake its two sides: the outer
  // face (in front of everything, seals the mouth) renders for the closed
  // half of the swing, the inner face (behind the letter, so paper slides
  // out in front of it) for the open half. Both copies use the *identical*
  // hinge transform — a translate/rotate/translate sandwich pivoting at
  // the shape's own top edge instead of its center. No 180deg pre-flip on
  // the inner copy: the faces are plain fills with no directional content,
  // and an extra rotation about the element's center would re-anchor the
  // silhouette so the open flap rendered apex-down at the hinge instead of
  // apex-up above it. The visibility handoff is a hard opacity cut at
  // exactly 90deg, where the flap is edge-on and invisible anyway — which
  // also sidesteps backfaceVisibility, unreliable on Android for views
  // with children.
  const flapFrontStyle = useAnimatedStyle(() => ({
    opacity: flap.value >= 0.5 ? 1 : 0,
    transform: [
      { perspective: 1400 },
      { translateY: -FLAP_H / 2 },
      { rotateX: `${interpolate(flap.value, [0, 1], [180, 0])}deg` },
      { translateY: FLAP_H / 2 },
    ],
  }));

  const flapBackStyle = useAnimatedStyle(() => ({
    opacity: flap.value < 0.5 ? 1 : 0,
    transform: [
      { perspective: 1400 },
      { translateY: -FLAP_H / 2 },
      { rotateX: `${interpolate(flap.value, [0, 1], [180, 0])}deg` },
      { translateY: FLAP_H / 2 },
    ],
  }));

  const sheetFace = { width: SHEET_W, height: SHEET_H, padding: SHEET_PADDING } as const;
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

  // Warm near-black (the palette's text tone) at low alpha — layered over
  // the envelope surface it shades the pocket interior and the flap's
  // underside so "inside" reads darker than "outside".
  const INTERIOR_SHADE = "rgba(43, 35, 32, 0.14)";
  const FLAP_INNER_SHADE = "rgba(43, 35, 32, 0.07)";
  // Corner radius of the pocket, and the half-stroke inset that keeps 1px
  // SVG strokes from being clipped at the svg's edges.
  const R = 10;
  const E = 0.5;

  // The envelope is three SVG layers sandwiching the letter, all sharing
  // the same footprint and stroke so they read as one object:
  //   z0 interior   — shaded rounded rect, the inside of the pocket, seen
  //                   through the mouth notch above the tucked letter;
  //   z0 flap back  — the flap's shaded underside, visible while open,
  //                   standing above the pocket *behind* the paper so a
  //                   letter slides out in front of it;
  //   z1 the paper  — (built in JSX below);
  //   z2 pocket front — one continuous path: the full envelope face with a
  //                   triangular mouth notch cut into its top edge (the
  //                   flap's exact footprint, so sealing covers it flush),
  //                   rounded bottom corners, and the two classic side-seam
  //                   creases running from the bottom corners up to the
  //                   notch apex;
  //   z3 flap front — the flap's outer face, sealing the mouth when closed.
  const interior = (
    <Svg
      width={ENVELOPE_W}
      height={ENVELOPE_H}
      style={{ position: "absolute", top: ENVELOPE_TOP, left: 0, zIndex: 0 }}
      pointerEvents="none"
    >
      <Rect
        x={E}
        y={E}
        width={ENVELOPE_W - 2 * E}
        height={ENVELOPE_H - 2 * E}
        rx={R}
        fill={colors.surface}
        stroke={colors.border}
        strokeWidth={1}
      />
      <Rect
        x={E}
        y={E}
        width={ENVELOPE_W - 2 * E}
        height={ENVELOPE_H - 2 * E}
        rx={R}
        fill={INTERIOR_SHADE}
      />
    </Svg>
  );

  const pocketFrontPath = [
    `M ${E} ${E}`,
    `L ${ENVELOPE_W / 2} ${FLAP_H}`,
    `L ${ENVELOPE_W - E} ${E}`,
    `L ${ENVELOPE_W - E} ${ENVELOPE_H - R}`,
    `Q ${ENVELOPE_W - E} ${ENVELOPE_H - E} ${ENVELOPE_W - R} ${ENVELOPE_H - E}`,
    `L ${R} ${ENVELOPE_H - E}`,
    `Q ${E} ${ENVELOPE_H - E} ${E} ${ENVELOPE_H - R}`,
    "Z",
  ].join(" ");

  const pocketFront = (
    <Svg
      width={ENVELOPE_W}
      height={ENVELOPE_H}
      style={{ position: "absolute", top: ENVELOPE_TOP, left: 0, zIndex: 2 }}
      pointerEvents="none"
    >
      <Path
        d={pocketFrontPath}
        fill={colors.surface}
        stroke={colors.border}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <Line
        x1={2}
        y1={ENVELOPE_H - 2}
        x2={ENVELOPE_W / 2}
        y2={FLAP_H + 1}
        stroke={colors.border}
        strokeWidth={1}
        strokeOpacity={0.55}
      />
      <Line
        x1={ENVELOPE_W - 2}
        y1={ENVELOPE_H - 2}
        x2={ENVELOPE_W / 2}
        y2={FLAP_H + 1}
        stroke={colors.border}
        strokeWidth={1}
        strokeOpacity={0.55}
      />
    </Svg>
  );

  const flapPath = `M ${E} ${E} L ${ENVELOPE_W - E} ${E} L ${ENVELOPE_W / 2} ${FLAP_H - E} Z`;
  const flapFace = (inner: boolean) => (
    <Svg width={ENVELOPE_W} height={FLAP_H}>
      <Path
        d={flapPath}
        fill={colors.surface}
        stroke={colors.border}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {inner && <Path d={flapPath} fill={FLAP_INNER_SHADE} />}
    </Svg>
  );

  const flapGeometry = {
    position: "absolute",
    top: ENVELOPE_TOP,
    left: 0,
    width: ENVELOPE_W,
    height: FLAP_H,
  } as const;

  const promptCopy: Record<string, { label: string; icon: "gesture-swipe-up" | "gesture-swipe-down" }> = {
    waitingToClose: {
      label: "Brūkštelėkite žemyn, kad uždarytumėte voką",
      icon: "gesture-swipe-down",
    },
    waitingToSend: {
      label: "Brūkštelėkite aukštyn, kad išsiųstumėte laišką",
      icon: "gesture-swipe-up",
    },
    waitingToOpen: {
      label: "Brūkštelėkite aukštyn, kad atplėštumėte voką",
      icon: "gesture-swipe-up",
    },
    waitingToPull: {
      label: "Brūkštelėkite aukštyn, kad ištrauktumėte laišką",
      icon: "gesture-swipe-up",
    },
  };
  const prompt = promptCopy[phase];

  return (
    <View style={{ alignItems: "center", gap: 20 }}>
      {/* marginTop shifts the whole (taller-than-the-envelope) group up so
          the envelope itself lands at visual center instead of the extra
          headroom above it — see the ENVELOPE_H/HEADROOM comment above. */}
      <View style={{ width: ENVELOPE_W, height: GROUP_H, marginTop: -HEADROOM / 2 }}>
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[{ width: ENVELOPE_W, height: GROUP_H }, containerStyle]}
            accessible={interactive}
            accessibilityRole={interactive ? "button" : undefined}
            accessibilityLabel={interactive ? prompt.label : undefined}
          >
            {/* Envelope interior + the flap's underside: both live behind
                the paper so the letter slides out in front of the open
                flap and rests against the shaded inside of the pocket. */}
            {interior}
            <Animated.View
              style={[{ ...flapGeometry, zIndex: 0 }, flapBackStyle]}
              pointerEvents="none"
            >
              {flapFace(true)}
            </Animated.View>

            {/* Paper: a single flat sheet, sliding between "fully out"
                (above the envelope) and "tucked" (resting on the envelope
                floor, its written face visible through the pocket's mouth
                notch). surfaceAlt — whiter than the surface-colored
                envelope — so it stays visibly *a letter* against the
                shaded pocket interior. */}
            <Animated.View
              style={[
                { position: "absolute", top: ENVELOPE_TOP, left: PAPER_LEFT, width: SHEET_W, height: SHEET_H, zIndex: 1 },
                paperSlotStyle,
              ]}
            >
              <View
                style={{
                  width: SHEET_W,
                  height: SHEET_H,
                  overflow: "hidden",
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  borderCurve: "continuous",
                }}
              >
                {sheetText}
              </View>
            </Animated.View>

            {/* Pocket front (mouth notch cut into its top edge), then the
                flap's outer face on top of everything for the visible
                swinging motion — the paper's own opacity (paperSlotStyle
                above) is what actually keeps it hidden while closed. */}
            {pocketFront}
            <Animated.View
              style={[{ ...flapGeometry, zIndex: 3 }, flapFrontStyle]}
              pointerEvents="none"
            >
              {flapFace(false)}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      <Animated.View style={[styles.promptRow, promptStyle]} pointerEvents="none">
        {prompt && (
          <>
            <MaterialCommunityIcons name={prompt.icon} size={18} color={colors.subtext} />
            <Text style={[styles.promptText, { color: colors.subtext }]}>{prompt.label}</Text>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  promptRow: {
    alignItems: "center",
    gap: 6,
    maxWidth: 240,
    minHeight: 18,
  },
  promptText: {
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
  },
});
