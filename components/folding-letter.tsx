import { pickBackground } from "@/components/animated-splash";
import { useTheme } from "@/contexts/theme";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

type Props = {
  body: string;
  mode: "send" | "receive";
  onDone: () => void;
};

/**
 * A letter sheet that folds in half and flies away (mode="send"), or
 * arrives folded from the bottom of the screen and unfolds to reveal the
 * text (mode="receive"). The real letter text is visible on the paper
 * throughout the fold. Runs its sequence on mount and calls onDone when
 * finished; haptics fire at the fold/land/launch beats.
 */
export function FoldingLetter({ body, mode, onDone }: Props) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const [splashTexture] = useState(pickBackground);

  const SHEET_W = Math.min(Math.round(width * 0.82), 340);
  const SHEET_H = Math.round(SHEET_W * 1.25);
  const HALF = SHEET_H / 2;

  // fold: 0 = sheet open flat, 1 = folded in half (paper back showing)
  // travel: 0 = resting in view, 1 = off-screen (top for send, bottom for receive)
  const fold = useSharedValue(mode === "send" ? 0 : 1);
  const travel = useSharedValue(mode === "send" ? 0 : 1);

  function haptic(style: Haptics.ImpactFeedbackStyle) {
    if (Platform.OS === "ios") Haptics.impactAsync(style);
  }

  function launch() {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    travel.value = withDelay(
      150,
      withTiming(
        1,
        { duration: 650, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(onDone)();
        }
      )
    );
  }

  function land() {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    fold.value = withDelay(
      250,
      withTiming(
        0,
        { duration: 550, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(finishOpen)();
        }
      )
    );
  }

  function finishOpen() {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    onDone();
  }

  useEffect(() => {
    if (mode === "send") {
      haptic(Haptics.ImpactFeedbackStyle.Light);
      fold.value = withDelay(
        250,
        withTiming(
          1,
          { duration: 550, easing: Easing.inOut(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(launch)();
          }
        )
      );
    } else {
      travel.value = withTiming(
        0,
        { duration: 650, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(land)();
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => {
    const t = travel.value;
    if (mode === "send") {
      return {
        opacity: interpolate(t, [0, 0.8, 1], [1, 1, 0]),
        transform: [
          { translateY: interpolate(t, [0, 1], [0, -height * 0.9]) },
          { rotateZ: `${interpolate(t, [0, 1], [0, 8])}deg` },
          { scale: interpolate(t, [0, 1], [1, 0.45]) },
        ],
      };
    }
    return {
      opacity: 1,
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

  // The same text is rendered in both halves, clipped to each half, so the
  // sheet splits along the fold line without any visual seam in the text.
  const sheetFace = {
    width: SHEET_W,
    height: SHEET_H,
    padding: 18,
  } as const;
  const sheetText = (
    <View style={sheetFace}>
      <Text style={{ color: colors.text, fontSize: 15, lineHeight: 24 }}>
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

  return (
    <Animated.View
      style={[{ width: SHEET_W, height: SHEET_H }, containerStyle]}
      pointerEvents="none"
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

      {/* Bottom half, front face: the lower part of the text, folding up
          around the fold line */}
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
      >
        <View style={{ transform: [{ translateY: -HALF }] }}>{sheetText}</View>
      </Animated.View>

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
  );
}
