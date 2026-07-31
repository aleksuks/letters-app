import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, {
  Defs,
  Ellipse,
  LinearGradient,
  Mask,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTour, TargetRect, TourStep } from "@/contexts/tour";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useStrings } from "@/lib/i18n";
import { tourStrings } from "@/lib/i18n/strings/tour";

// How far the pool of light spreads past the control it lights. The falloff
// (POOL_STOPS) eats the outer third of that, so the visibly clear area is
// only a little larger than the control itself.
const POOL_PAD_X = 56;
const POOL_PAD_Y = 46;
const POOL_MIN_RX = 64;
const POOL_MIN_RY = 58;
// Touch-through gap around the control — the pool is soft and much wider,
// so this is deliberately tight: only the control itself stays tappable.
const HOLE_PAD = 8;
// Measured after the tab slide (TAB_TRANSITION_DURATION = 380ms) has
// settled, so the target's window coordinates are its resting ones.
const MEASURE_DELAY = 450;
// The farewell isn't anchored to anything — it waits out a beat of actual
// map browsing first, so it reads as a goodbye rather than an interruption.
const FAREWELL_DELAY = 4200;

const SCRIM_OPACITY = 0.58;
// Beam geometry: a narrow apex just off the top edge widening into the pool.
const BEAM_APEX_Y = -24;
const BEAM_APEX_HALF_WIDTH = 16;
const BEAM_MAX_HALF_WIDTH = 150;
// Below this fraction of screen height there isn't enough room above the
// pool for a beam to read as anything but a smear, so it's dropped.
const BEAM_MIN_CENTER_FRACTION = 0.3;

type StepConfig = {
  /** Registered target id, or null for a step that lights nothing. */
  target: string | null;
  /** Tab route that must be focused for the step to show; null = tab bar, always visible. */
  requiresTab: string | null;
};

const STEP_CONFIG: Record<Exclude<TourStep, "done">, StepConfig> = {
  lettersTab: { target: "tab-letters", requiresTab: null },
  receiveButton: { target: "receive-button", requiresTab: "letters" },
  mapTab: { target: "tab-map", requiresTab: null },
  // Anchored to nothing and gated on no tab: the goodbye is owed once the
  // map has been reached, even if the user wanders off in the meantime.
  farewell: { target: null, requiresTab: null },
};

/**
 * One spotlight step at a time: the screen dims except for a soft-edged oval
 * pool of light around the real control the step points at, with a faint
 * beam angling down into it and a one-line bubble alongside.
 *
 * The dimming is a single full-screen rect masked by a radial gradient
 * (react-native-svg), so the pool's edge is a genuine falloff rather than a
 * cut — there is no outline on the target, and no seams. That layer is
 * purely visual (`pointerEvents="none"`); touch-through is handled
 * separately by four transparent panes leaving a tight rectangular gap over
 * the control, so performing the action is what advances the tour
 * (contexts/tour.tsx). The only other exit is the explicit skip link.
 */
export function TourSpotlight() {
  const { step, focusedTab, measureTarget, advanceFrom, skip } = useTour();
  const { colors } = useTheme();
  const { largeTouchTargets, reducedMotion } = useAccessibility();
  const { width, height } = useWindowDimensions();
  const t = useStrings(tourStrings);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [farewellReady, setFarewellReady] = useState(false);

  const config = step && step !== "done" ? STEP_CONFIG[step] : null;

  // Relaunching mid-tour lands on the Obituary tab, which may not be where
  // the current step's control lives. Rather than going silent — stranding
  // the tour until the user happens to find the right tab — the step falls
  // back to pointing at the tab that gets them there.
  const redirectTab =
    config && config.requiresTab !== null && focusedTab !== config.requiresTab
      ? config.requiresTab
      : null;
  const targetId = redirectTab ? `tab-${redirectTab}` : (config?.target ?? null);
  const isFarewell = step === "farewell";

  const stepText = redirectTab
    ? t.stepLettersTab
    : step === "lettersTab"
      ? t.stepLettersTab
      : step === "receiveButton"
        ? t.stepReceiveButton
        : step === "mapTab"
          ? t.stepMapTab
          : t.farewell;

  // Haze drifting through the beam — the only motion, slow enough to read as
  // atmosphere rather than an attention-grab. Stilled under reduced motion.
  const beamOpacity = useSharedValue(1);
  useEffect(() => {
    if (!rect || reducedMotion) {
      beamOpacity.value = 1;
      return;
    }
    beamOpacity.value = withRepeat(
      withSequence(
        withTiming(0.72, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [rect, reducedMotion, beamOpacity]);

  const beamStyle = useAnimatedStyle(() => ({ opacity: beamOpacity.value }));

  useEffect(() => {
    setRect(null);
    setFarewellReady(false);
    if (!config) return;
    let cancelled = false;

    if (targetId === null) {
      const timer = setTimeout(() => {
        if (!cancelled) setFarewellReady(true);
      }, FAREWELL_DELAY);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    const timer = setTimeout(() => {
      measureTarget(targetId).then((measured) => {
        if (!cancelled) setRect(measured);
      });
    }, MEASURE_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // width/height: re-measure after rotation/resize.
  }, [step, config, targetId, measureTarget, width, height]);

  const visible = isFarewell ? farewellReady : rect !== null;

  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(stepText);
  }, [visible, stepText]);

  const s = makeStyles(colors);

  if (!visible) return null;

  // The farewell lights nothing and dims nothing — the map stays fully
  // visible behind it, since the point is that the tour is getting out of
  // the way. Tapping the button is the last thing the tour ever asks for.
  if (isFarewell) {
    return (
      <Animated.View
        style={s.overlay}
        pointerEvents="box-none"
        entering={reducedMotion ? undefined : FadeIn.duration(400)}
        exiting={reducedMotion ? undefined : FadeOut.duration(250)}
      >
        <View style={[s.bubble, s.farewellBubble]} accessibilityLiveRegion="polite">
          <Text style={s.bubbleText}>{t.farewell}</Text>
          <TouchableOpacity
            onPress={() => advanceFrom("farewell")}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
            style={s.farewellButton}
            accessibilityRole="button"
            accessibilityLabel={t.farewellButton}
          >
            <Text style={s.farewellButtonText}>{t.farewellButton}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  // Non-null on this path — `visible` is rect !== null for anchored steps.
  const target = rect as TargetRect;
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  const rx = Math.max(target.width / 2 + POOL_PAD_X, POOL_MIN_RX);
  const ry = Math.max(target.height / 2 + POOL_PAD_Y, POOL_MIN_RY);

  const hole = {
    x: target.x - HOLE_PAD,
    y: target.y - HOLE_PAD,
    width: target.width + HOLE_PAD * 2,
    height: target.height + HOLE_PAD * 2,
  };

  const showBeam = cy > height * BEAM_MIN_CENTER_FRACTION;
  const beamHalfWidth = Math.min(rx * 0.9, BEAM_MAX_HALF_WIDTH);
  const beamPoints = [
    `${cx - BEAM_APEX_HALF_WIDTH},${BEAM_APEX_Y}`,
    `${cx + BEAM_APEX_HALF_WIDTH},${BEAM_APEX_Y}`,
    `${cx + beamHalfWidth},${cy}`,
    `${cx - beamHalfWidth},${cy}`,
  ].join(" ");

  const bubbleAbove = cy > height / 2;

  return (
    <Animated.View
      key={step}
      style={s.overlay}
      pointerEvents="box-none"
      entering={reducedMotion ? undefined : FadeIn.duration(320)}
      exiting={reducedMotion ? undefined : FadeOut.duration(200)}
    >
      {/* pointerEvents lives on a plain View rather than on <Svg>: if the
          scrim ever did swallow touches, the spotlit control would be
          untappable and the tour could not be completed at all. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {/* Luminance mask: black hides the scrim, white keeps it. The ramp
              between them is the soft edge of the pool. */}
          <RadialGradient id="pool" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#000000" />
            <Stop offset="0.5" stopColor="#000000" />
            <Stop offset="0.72" stopColor="#3d3d3d" />
            <Stop offset="0.88" stopColor="#b8b8b8" />
            <Stop offset="1" stopColor="#ffffff" />
          </RadialGradient>
          <Mask id="spotlight" maskUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
            <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#pool)" />
          </Mask>
        </Defs>

        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="#000000"
          opacity={SCRIM_OPACITY}
          mask="url(#spotlight)"
        />
      </Svg>
      </View>

      {/* Separate layer so the haze can breathe without re-rendering the
          mask, and so the light sits over the scrim rather than under it. */}
      {showBeam && (
        <Animated.View style={[StyleSheet.absoluteFill, beamStyle]} pointerEvents="none">
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient
                id="beamFill"
                x1={0}
                y1={BEAM_APEX_Y}
                x2={0}
                y2={cy}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor="#ffffff" stopOpacity={0.02} />
                <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0.07} />
                <Stop offset="0.85" stopColor="#ffffff" stopOpacity={0.04} />
                <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Polygon points={beamPoints} fill="url(#beamFill)" />
          </Svg>
        </Animated.View>
      )}

      {/* Transparent touch blockers around a tight gap over the control —
          hit-testing only, no appearance of their own. */}
      <Pressable style={[s.blocker, { top: 0, left: 0, right: 0, height: hole.y }]} />
      <Pressable style={[s.blocker, { top: hole.y, left: 0, width: hole.x, height: hole.height }]} />
      <Pressable
        style={[s.blocker, { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height }]}
      />
      <Pressable style={[s.blocker, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} />

      <View
        style={[
          s.bubble,
          bubbleAbove ? { bottom: height - (cy - ry) + 4 } : { top: cy + ry + 4 },
        ]}
        accessibilityLiveRegion="polite"
      >
        <Text style={s.bubbleText}>{stepText}</Text>
        <TouchableOpacity
          onPress={skip}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          style={s.skipButton}
          accessibilityRole="button"
          accessibilityLabel={t.skip}
        >
          <Text style={s.skipText}>{t.skip}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 200,
      elevation: 200,
    },
    blocker: { position: "absolute" },
    bubble: {
      position: "absolute",
      left: 20,
      right: 20,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderCurve: "continuous",
      padding: 16,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    bubbleText: { fontSize: 15, color: colors.text, lineHeight: 22 },
    skipButton: { alignSelf: "flex-end" },
    skipText: { fontSize: 13, color: colors.subtext, textDecorationLine: "underline" },
    // Sits above the tab bar rather than beside a target, since it points at
    // nothing.
    farewellBubble: { bottom: 96 },
    farewellButton: {
      alignSelf: "flex-end",
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    farewellButtonText: { fontSize: 14, fontWeight: "700", color: colors.accentText },
  });
}
