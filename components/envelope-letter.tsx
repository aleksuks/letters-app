import { useTheme } from "@/contexts/theme";
import { useAccessibility } from "@/contexts/accessibility";
import { useSound, useScrubSound } from "@/hooks/use-sound";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Defs, Image as SvgImage, Line, Path, Pattern, Rect } from "react-native-svg";
import { DrawingView } from "@/components/drawing-view";
import { isValidDrawing } from "@/lib/drawing";
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
  /**
   * The letter's crayon drawing, if it has one. A letter that carries both
   * text and a picture is pulled out in two beats — the written sheet first,
   * then the picture behind it. A drawing-only letter has no second beat:
   * the picture *is* the sheet.
   */
  drawing?: unknown;
  mode: "send" | "receive";
  onDone: () => void;
  /** Fired the moment the user commits to actually sending the envelope away. */
  onStart?: () => void;
  /** Receive only: fired the moment the final pull-free swipe commits, so the
   * host screen can start a full-screen transition (e.g. fade to white)
   * timed to the letter's last upward motion instead of cutting in only
   * once `onDone` fires. */
  onPulling?: () => void;
  /** Receive only: plays the open + pull beats automatically, back to back,
   * instead of pausing at each one to wait for a swipe or tap — used for
   * the one-time welcome letter, which presents itself with no gesture
   * required. The waiting phases still exist (so timing/haptics/sound stay
   * identical to a manual receive) but their gestures are disabled and the
   * pulsing "swipe me" prompt never appears, since there's nothing to do. */
  autoPlay?: boolean;
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
  // Receive only, and only when the letter carries both text and a picture:
  // the same peek/wait/pull beats again for the second sheet.
  | "peekingPicture"
  | "waitingToPullPicture"
  | "pullingPicture"
  | "done";

// How far (px) a finger has to travel to carry a gestured stage (closing,
// opening, sending, pulling) from its resting value to its target — the
// drag maps 1:1 onto progress, so dragging halfway gets it halfway there,
// and reversing mid-drag backs it off again in real time.
const DRAG_DISTANCE = 110;
// Effectively "never" for the wrong-direction bound of activeOffsetY, so a
// pan only ever activates for the one direction that matters per stage.
const NEVER = 100000;
// Progress units per second the visual follow is allowed to travel while
// chasing the finger — capped just high enough that ordinary drags still
// read as immediate, but a near-instantaneous jump (a full swipe registered
// within a single touch event) animates into place over a short, visible
// beat instead of teleporting. Purely cosmetic: it only smooths what's
// drawn on screen, and is never consulted when deciding whether a drag has
// committed (see onUpdate below).
const MAX_DRAG_SPEED = 7;
// px/s of vertical velocity, in the gesture's forward direction, that counts
// as a confident flick — lets a fast swipe commit a stage even if the
// finger let go a little short of the full DRAG_DISTANCE, since natural
// flicks are often shorter *and* faster than a deliberate slow drag.
const FLICK_VELOCITY = 800;

// Recycled-paper grain used to fill the envelope's surfaces (pocket, flap)
// instead of a flat color — the stroked outlines/creases stay separate
// <Path>/<Line> strokes on top, untouched by this.
const PAPER_TEXTURE = require("@/assets/images/paper.jpg");

// One texture tile stretched (cropped, not repeated) to exactly cover a
// width x height shape — avoids visible seams a true repeating pattern
// would need a seamless source image for. `id` must be unique within the
// enclosing <Svg> (each envelope surface is its own separate <Svg> root,
// so the same id can safely be reused across them).
function paperFill(id: string, width: number, height: number) {
  return (
    <Defs>
      <Pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse">
        <SvgImage
          href={PAPER_TEXTURE}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid slice"
        />
      </Pattern>
    </Defs>
  );
}

/**
 * Builds the tap-or-drag gesture for one gestured stage of the ceremony
 * (closing the flap, sending it away, opening the flap, pulling the letter
 * out). `value` eases toward the finger's `from`..`to` position as the user
 * drags (capped-speed, so it stays a visible animation rather than a raw
 * teleport on a fast swipe); `dragUp` selects which finger direction counts
 * as forward progress. Reaching `to`
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

      // Eased follow purely for how it looks on screen — capped-duration
      // so a fast swipe still animates instead of teleporting.
      const duration = (Math.abs(target - value.value) / MAX_DRAG_SPEED) * 1000;
      value.value = withTiming(target, { duration, easing: Easing.linear });

      // Committing is decided directly off the raw drag progress `t`
      // above, never off whether the eased follow animation has finished
      // — it used to be gated on that animation's completion callback,
      // but a fast drag starts a new withTiming on every touch move,
      // interrupting the previous one before it can ever report
      // `finished`, so a quick swipe that reached the end of the drag
      // distance could silently fail to commit. Checking `t` here instead
      // means the visual catch-up can lag a swipe without the commit
      // decision ever depending on it.
      if (t >= 1) {
        committing.value = true;
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        runOnJS(onCommit)(true);
      }
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
      if (t < 1 && t > 0.15 && velocity > FLICK_VELOCITY) {
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
 * mark every beat (a woosh as the letter flies away, a scrubbing tear on
 * opening).
 */
export function EnvelopeLetter({ body, drawing, mode, onDone, onStart, onPulling, autoPlay }: Props) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibility();
  const playWoosh = useSound(require("@/assets/sounds/woosh.wav"));
  const tear = useScrubSound(require("@/assets/sounds/tear.wav"));
  const { width, height } = useWindowDimensions();
  const [fontsLoaded] = useFonts({
    SpecialElite: require("@/assets/fonts/SpecialElite-Regular.ttf"),
  });
  const [phase, setPhase] = useState<Phase>(mode === "send" ? "entering" : "arriving");

  // A letter carries a picture, words, or both. With both, the picture is a
  // second sheet tucked behind the written one and gets its own pull. With
  // only a picture there is nothing to read, so it takes the sheet's place
  // rather than leaving the reader to pull a blank page out first.
  const hasDrawing = isValidDrawing(drawing) && drawing.strokes.length > 0;
  const pictureOnSheet = hasDrawing && body.trim().length === 0;
  const pictureIsSeparate = hasDrawing && !pictureOnSheet && mode === "receive";

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
  // A sheet showing a picture always takes the tallest allowed box: the
  // drawing is square, and sizing it off an absent letter's text would leave
  // it squashed into the minimum height.
  const SHEET_H = Math.round(
    pictureOnSheet
      ? MAX_SHEET_H
      : Math.min(MAX_SHEET_H, Math.max(MIN_SHEET_H, naturalHeight))
  );
  const maxLines = Math.max(1, Math.floor((SHEET_H - SHEET_PADDING * 2) / lineHeight));

  // Envelope geometry. The envelope sits at the bottom of a taller group box
  // (HEADROOM above it) so the letter's full travel range up to FULLY_OUT_Y
  // stays within the group's own laid-out bounds — a touch outside a native
  // view's frame never reaches it, even for a transformed descendant that's
  // visually rendered there. The group is then shifted up by half that
  // headroom (negative margin) so the envelope itself — not the invisible
  // headroom — ends up sitting at the visual center.
  //
  // The pocket is a little wider than the letter so the paper visibly fits
  // *inside* it rather than sharing its exact silhouette.
  const ENVELOPE_W = SHEET_W + 14;
  // Fixed, compact aspect ratio — independent of the letter's own height, so
  // the envelope always reads as an envelope instead of stretching tall for
  // long letters (it used to be derived from SHEET_H directly, which made it
  // nearly as tall as it was wide for long letters). A letter taller than
  // this isn't grown to fit; see TUCKED_Y/TUCKED_VISIBLE_H below, which
  // clip the excess at the pocket floor instead.
  const ENVELOPE_H = Math.round(ENVELOPE_W * 0.72);
  const FLAP_H = Math.round(ENVELOPE_H * 0.58);
  const PAPER_LEFT = (ENVELOPE_W - SHEET_W) / 2;
  // "Fully out": the sheet sits above the envelope with just its bottom
  // edge dipping into the mouth, so it still reads as belonging to it.
  const FULLY_OUT_Y = -Math.round(SHEET_H * 0.92);
  // The picture comes to rest a little lower than the written sheet, so the
  // letter's top edge stays visible behind it and the pair reads as two
  // things drawn from one envelope rather than one sheet swapping for another.
  const PICTURE_OUT_Y = FULLY_OUT_Y + 24;
  const HEADROOM = Math.abs(FULLY_OUT_Y) + 24;
  const GROUP_H = ENVELOPE_H + HEADROOM;
  const ENVELOPE_TOP = HEADROOM;
  // Tucked letters rest just under the envelope's mouth — a small, fixed
  // inset from the top, not floor-anchored, now that the envelope no longer
  // grows to match the letter's height.
  const TUCKED_Y = 6;
  // How much of the sheet is visible while fully tucked: from the inset
  // above down to a few px shy of the pocket floor (paperSlotStyle clips
  // to exactly this via an animated height). Only ever less than SHEET_H
  // for a letter longer than the envelope — short letters are unaffected,
  // since this is then just SHEET_H itself.
  const TUCKED_VISIBLE_H = Math.max(
    SHEET_PADDING * 2,
    Math.min(SHEET_H, ENVELOPE_H - TUCKED_Y - 6)
  );

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
  // emergePicture: the same 0..1 for the second sheet, when there is one.
  const emergePicture = useSharedValue(0);
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
    if (!autoPlay) startInvite();
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
    if (!autoPlay) startInvite();
  }

  function commitPull(fromDrag: boolean) {
    if (phase !== "waitingToPull") return;
    setPhase("pulling");
    invite.value = withTiming(0, { duration: 150 });
    // onPulling exists so the host can start its screen transition on the
    // letter's *last* upward motion. With a picture still to come, this
    // isn't it — the picture's pull is (see commitPullPicture).
    if (!pictureIsSeparate) onPulling?.();
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
    // beat with the letter held free of the envelope, then either hand off
    // or start the picture's own peek/pull.
    setTimeout(() => (pictureIsSeparate ? peekPicture() : finishOpen()), d(150));
  }

  // ---- RECEIVE, second sheet (text + picture letters only) ----

  function peekPicture() {
    setPhase("peekingPicture");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    emergePicture.value = withTiming(
      0.35,
      { duration: d(200), easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(afterPeekPicture)();
      }
    );
  }

  function afterPeekPicture() {
    setPhase("waitingToPullPicture");
    committing.value = false;
    if (!autoPlay) startInvite();
  }

  function commitPullPicture(fromDrag: boolean) {
    if (phase !== "waitingToPullPicture") return;
    setPhase("pullingPicture");
    invite.value = withTiming(0, { duration: 150 });
    onPulling?.();
    if (fromDrag) {
      emergePicture.value = 1;
      pictureSettle();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    emergePicture.value = withDelay(
      d(50),
      withTiming(1, { duration: d(260), easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(pictureSettle)();
      })
    );
  }

  function pictureSettle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

  // Drives autoPlay through the two gestured receive stages on a plain
  // timer, keyed off `phase` rather than fired inline from arrive()/
  // afterPeek(). Those functions call setPhase() and a setTimeout scheduled
  // in that same tick would still close over the *pre-transition* phase —
  // commitOpen/commitPull each guard on `if (phase !== "waitingTo...")
  // return`, so a stale closure's timer would silently no-op. Keying this
  // effect off `phase` guarantees commitOpen/commitPull are called from a
  // render where phase has actually caught up.
  useEffect(() => {
    if (!autoPlay) return;
    if (phase === "waitingToOpen") {
      const timer = setTimeout(() => commitOpen(false), d(500));
      return () => clearTimeout(timer);
    }
    if (phase === "waitingToPull") {
      const timer = setTimeout(() => commitPull(false), d(500));
      return () => clearTimeout(timer);
    }
    if (phase === "waitingToPullPicture") {
      const timer = setTimeout(() => commitPullPicture(false), d(500));
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, autoPlay]);

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
    enabled: phase === "waitingToOpen" && !autoPlay,
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
    enabled: phase === "waitingToPull" && !autoPlay,
    value: emerge,
    from: 0.35,
    to: 1,
    dragUp: true,
    committing,
    midpointTicked,
    lastProgress,
    onCommit: commitPull,
  });

  const pullPictureGesture = buildDragStage({
    enabled: phase === "waitingToPullPicture" && !autoPlay,
    value: emergePicture,
    from: 0.35,
    to: 1,
    dragUp: true,
    committing,
    midpointTicked,
    lastProgress,
    onCommit: commitPullPicture,
  });

  const gesture = Gesture.Race(
    closeGesture,
    launchGesture,
    openGesture,
    pullGesture,
    pullPictureGesture
  );

  const interactive =
    !autoPlay &&
    (phase === "waitingToClose" ||
      phase === "waitingToSend" ||
      phase === "waitingToOpen" ||
      phase === "waitingToPull" ||
      phase === "waitingToPullPicture");

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
  // until pulled, then carries it fully out. No opacity tricks — the
  // paper is fully opaque and hidden purely by layer order: the pocket
  // front covers everything below the mouth notch, the tucked sheet's
  // top sliver stays visible through the notch (that's the "letter
  // inside" read), and a mid-swing flap covering only part of the notch
  // is a real envelope's look, not a bug. This is safe only because the
  // flap's 3D rotation is flattened inside its clip wrappers — see the
  // flapClip comment for the iOS depth-compositing failure that
  // otherwise makes these sibling layers z-fight.
  //
  // `height` rides along on the same interpolation, animating between the
  // sheet's full height (clear of the envelope) and TUCKED_VISIBLE_H
  // (fully tucked) — a no-op for a letter that fits, but for one longer
  // than the envelope it crops the excess at the pocket floor via the
  // wrapping view's overflow:hidden instead of letting it hang out below.
  const paperSlotStyle = useAnimatedStyle(() => {
    const y =
      mode === "send"
        ? interpolate(slide.value, [0, 1], [FULLY_OUT_Y, TUCKED_Y])
        : interpolate(emerge.value, [0, 1], [TUCKED_Y, FULLY_OUT_Y]);
    const tuckedness = mode === "send" ? slide.value : 1 - emerge.value;
    return {
      transform: [{ translateY: y }],
      height: interpolate(tuckedness, [0, 1], [SHEET_H, TUCKED_VISIBLE_H]),
    };
  });

  // The second sheet's slot. Identical mechanics to paperSlotStyle, on its
  // own shared value and resting a little lower when out (PICTURE_OUT_Y).
  const pictureSlotStyle = useAnimatedStyle(() => {
    const y = interpolate(emergePicture.value, [0, 1], [TUCKED_Y, PICTURE_OUT_Y]);
    const tuckedness = 1 - emergePicture.value;
    return {
      transform: [{ translateY: y }],
      height: interpolate(tuckedness, [0, 1], [SHEET_H, TUCKED_VISIBLE_H]),
    };
  });

  // The flap rotates on a hinge along the envelope's top edge, from sealed
  // (apex down over the mouth, 0deg) to standing fully open above the
  // pocket (180deg, apex up) — visible in both rest states, like a real
  // envelope flap. Two single-faced copies fake its two sides: the outer
  // face (in front of everything, seals the mouth) renders for the closed
  // half of the swing, the inner face (behind the letter, so paper slides
  // out in front of it) for the open half. The hinge comes from layout,
  // not a transform sandwich: each face's view is double the flap's
  // height with the triangle anchored in its bottom half (flapPlane
  // below), so the view's own center — the pivot RN rotates about — *is*
  // the hinge line, and the transform stays a bare perspective+rotateX.
  // That matters on Android, which can't apply an arbitrary 4x4 matrix to
  // a view: it decomposes the matrix into rotation/translation view props
  // and drops the z-translation, so the previous translate/rotate/
  // translate pivot sandwich re-anchored at the center and visibly
  // detached the flap from its hinge mid-swing (sagging off the top edge
  // and pinching narrower than the notch); a pure center rotateX survives
  // the decomposition exactly. No 180deg pre-flip on the inner copy: the
  // faces are plain fills with no directional content. The visibility
  // handoff is a hard opacity cut at exactly 90deg, where the flap is
  // edge-on and invisible anyway — which also sidesteps
  // backfaceVisibility, unreliable on Android for views with children.
  const flapFrontStyle = useAnimatedStyle(() => ({
    opacity: flap.value >= 0.5 ? 1 : 0,
    transform: [
      { perspective: 1400 },
      { rotateX: `${interpolate(flap.value, [0, 1], [180, 0])}deg` },
    ],
  }));

  const flapBackStyle = useAnimatedStyle(() => ({
    opacity: flap.value < 0.5 ? 1 : 0,
    transform: [
      { perspective: 1400 },
      { rotateX: `${interpolate(flap.value, [0, 1], [180, 0])}deg` },
    ],
  }));

  const sheetFace = { width: SHEET_W, height: SHEET_H, padding: SHEET_PADDING } as const;
  const PICTURE_SIZE = Math.min(SHEET_W, SHEET_H) - SHEET_PADDING * 2;
  const pictureFace = (
    <View style={[sheetFace, { alignItems: "center", justifyContent: "center" }]}>
      <DrawingView drawing={drawing} size={PICTURE_SIZE} />
    </View>
  );
  const sheetText = (
    <View style={sheetFace}>
      <Text
        style={{
          color: colors.text,
          fontFamily: fontsLoaded ? "SpecialElite" : undefined,
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
  // A drawing-only letter puts the picture on the sheet itself — there is no
  // blank page to pull out ahead of it.
  const sheetContent = pictureOnSheet ? pictureFace : sheetText;

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
  // This ordering is only trustworthy because every layer here is FLAT.
  // The flap's 3D rotation lives inside overflow-hidden wrappers (see
  //  flapClip below): iOS Core Animation depth-composites siblings in
  // real 3D the moment any sibling layer has a non-flat transform, and
  // the coplanar paper/pocket layers then z-fight per frame — the letter
  // visibly flickered in front of the whole envelope during every flap
  // swing until the 3D was contained.
  const interior = (
    <Svg
      width={ENVELOPE_W}
      height={ENVELOPE_H}
      style={{ position: "absolute", top: ENVELOPE_TOP, left: 0, zIndex: 0 }}
      pointerEvents="none"
    >
      {paperFill("envelopeTexture", ENVELOPE_W, ENVELOPE_H)}
      {/* Opaque backing beneath the texture pattern: the pattern fill draws
          nothing until its source image has decoded, and without this the
          paper (always opaque, never waiting on an async image) shows
          straight through every envelope surface for the first frame or
          two — most visible during the receive fly-in, which starts
          animating immediately on mount. */}
      <Rect
        x={E}
        y={E}
        width={ENVELOPE_W - 2 * E}
        height={ENVELOPE_H - 2 * E}
        rx={R}
        fill={colors.surface}
      />
      <Rect
        x={E}
        y={E}
        width={ENVELOPE_W - 2 * E}
        height={ENVELOPE_H - 2 * E}
        rx={R}
        fill="url(#envelopeTexture)"
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
      {paperFill("envelopeTexture", ENVELOPE_W, ENVELOPE_H)}
      {/* Opaque backing — see the matching comment on `interior` above. */}
      <Path d={pocketFrontPath} fill={colors.surface} />
      <Path
        d={pocketFrontPath}
        fill="url(#envelopeTexture)"
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
      {paperFill("flapTexture", ENVELOPE_W, FLAP_H)}
      {/* Opaque backing — see the matching comment on `interior` above. */}
      <Path d={flapPath} fill={colors.surface} />
      <Path
        d={flapPath}
        fill="url(#flapTexture)"
        stroke={colors.border}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {inner && <Path d={flapPath} fill={FLAP_INNER_SHADE} />}
    </Svg>
  );

  // Each flap face is a static overflow-hidden wrapper (flapClip) around
  // the rotating plane (flapPlane). The wrapper is what the rest of the
  // envelope composites against, and clipping forces the rotated plane
  // to be flattened into it first — without this, iOS Core Animation
  // sees a sibling with a non-flat 3D transform and switches the whole
  // sibling group to true depth compositing, where the paper and pocket
  // (both at depth 0) z-fight and the letter flickers in front of the
  // entire envelope on every flap swing. The padding keeps the
  // perspective-magnified projection (apex swings toward the camera,
  // scaling up to ~1.13x, and platform camera tuning varies) clear of
  // the clip edge for the whole swing.
  const FLAP_PAD = Math.round(FLAP_H * 0.4);
  const flapClip = {
    position: "absolute",
    top: ENVELOPE_TOP - FLAP_H - FLAP_PAD,
    left: -FLAP_PAD,
    width: ENVELOPE_W + FLAP_PAD * 2,
    height: FLAP_H * 2 + FLAP_PAD * 2,
    overflow: "hidden",
  } as const;
  // Double-height with the triangle pushed to the bottom half, so the
  // view's center — RN's rotation pivot — lands exactly on the hinge
  // (the envelope's top edge); see the hinge comment above flapFrontStyle.
  const flapPlane = {
    position: "absolute",
    top: FLAP_PAD,
    left: FLAP_PAD,
    width: ENVELOPE_W,
    height: FLAP_H * 2,
    justifyContent: "flex-end",
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
    waitingToPullPicture: {
      label: "Brūkštelėkite aukštyn, kad ištrauktumėte piešinį",
      icon: "gesture-swipe-up",
    },
  };
  const prompt = promptCopy[phase];

  return (
    // The gesture surface is the whole available screen area, not just the
    // envelope's own frame. Users swipe wherever their thumb happens to be —
    // a pan that started a few px off the envelope used to die at
    // hit-testing (touches outside a view's frame never reach it), which
    // read as the app randomly ignoring the gesture.
    <GestureDetector gesture={gesture}>
      <View
        style={{ flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: 20 }}
        accessible={interactive}
        accessibilityRole={interactive ? "button" : undefined}
        accessibilityLabel={interactive ? prompt.label : undefined}
      >
      {/* marginTop shifts the whole (taller-than-the-envelope) group up so
          the envelope itself lands at visual center instead of the extra
          headroom above it — see the ENVELOPE_H/HEADROOM comment above. */}
      <View style={{ width: ENVELOPE_W, height: GROUP_H, marginTop: -HEADROOM / 2 }}>
          <Animated.View
            style={[{ width: ENVELOPE_W, height: GROUP_H }, containerStyle]}
          >
            {/* Envelope interior + the flap's underside: both live behind
                the paper so the letter slides out in front of the open
                flap and rests against the shaded inside of the pocket. */}
            {interior}
            <View style={{ ...flapClip, zIndex: 0 }} pointerEvents="none">
              <Animated.View style={[flapPlane, flapBackStyle]}>
                {flapFace(true)}
              </Animated.View>
            </View>

            {/* Paper: a single flat sheet, sliding between "fully out"
                (above the envelope) and "tucked" (resting just under the
                envelope's mouth, its written face visible through the
                pocket's notch). surfaceAlt — whiter than the surface-colored
                envelope — so it stays visibly *a letter* against the shaded
                pocket interior. overflow:hidden + the animated height on
                paperSlotStyle crop a letter taller than the envelope at the
                pocket floor instead of letting it hang out below. */}
            <Animated.View
              style={[
                { position: "absolute", top: ENVELOPE_TOP, left: PAPER_LEFT, width: SHEET_W, overflow: "hidden", zIndex: 1 },
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
                {sheetContent}
              </View>
            </Animated.View>

            {/* The picture, when it's a second sheet. Same zIndex as the
                written one and rendered after it, so it sits in front once
                both are out — while tucked, both are behind the pocket front
                either way, and once out they're clear of the envelope
                entirely, so document order is the only thing deciding which
                of the two is on top. */}
            {pictureIsSeparate && (
              <Animated.View
                style={[
                  { position: "absolute", top: ENVELOPE_TOP, left: PAPER_LEFT, width: SHEET_W, overflow: "hidden", zIndex: 1 },
                  pictureSlotStyle,
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
                  {pictureFace}
                </View>
              </Animated.View>
            )}

            {/* Pocket front (mouth notch cut into its top edge), then the
                flap's outer face on top of everything for the visible
                swinging motion. */}
            {pocketFront}
            <View style={{ ...flapClip, zIndex: 3 }} pointerEvents="none">
              <Animated.View style={[flapPlane, flapFrontStyle]}>
                {flapFace(false)}
              </Animated.View>
            </View>
          </Animated.View>
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
    </GestureDetector>
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
