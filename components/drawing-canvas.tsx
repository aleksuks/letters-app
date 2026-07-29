import { useCallback, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg from "react-native-svg";
import { CrayonStroke, CrayonStrokes } from "@/components/crayon-path";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import * as Haptics from "@/lib/haptics";
import { useStrings, format } from "@/lib/i18n";
import { drawingCanvasStrings } from "@/lib/i18n/strings/drawing-canvas";
import {
  CANVAS_SIZE,
  CRAYON_COLORS,
  CRAYON_WIDTHS,
  colorAt,
  Drawing,
  MAX_STROKES,
  shouldKeepPoint,
  Stroke,
  strokeToPath,
} from "@/lib/drawing";

interface DrawingCanvasProps {
  value: Drawing;
  onChange: (next: Drawing) => void;
}

/**
 * The crayon pad: ten colours, three nib sizes, undo, clear.
 *
 * Deliberately crude. There is no fill, no eraser, no layers and no zoom —
 * a letter's picture is meant to be a scribble in the margin, not artwork,
 * and every tool added here is a tool that makes someone feel their drawing
 * isn't good enough to send.
 *
 * The in-progress stroke is held in component state and the committed ones in
 * the parent's `value`, so a finished line stops re-rendering as new points
 * arrive. Points are thinned on capture (see `shouldKeepPoint`) — the touch
 * stream samples far denser than a crayon line needs.
 */
export function DrawingCanvas({ value, onChange }: DrawingCanvasProps) {
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const t = useStrings(drawingCanvasStrings);
  const s = makeStyles(colors);

  const [colorIndex, setColorIndex] = useState(0);
  const [width, setWidth] = useState<number>(CRAYON_WIDTHS[1]);
  const [side, setSide] = useState(0);
  const [live, setLive] = useState<[number, number][]>([]);
  const liveRef = useRef<[number, number][]>([]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setSide(e.nativeEvent.layout.width);
  }, []);

  // View px -> canvas units, so a drawing made on any phone renders the same
  // everywhere. Clamped: a finger that slides past the edge should smear
  // along it rather than record points outside the paper.
  const toCanvas = useCallback(
    (x: number, y: number): [number, number] => {
      if (side <= 0) return [0, 0];
      const scale = CANVAS_SIZE / side;
      const clamp = (n: number) => Math.max(0, Math.min(CANVAS_SIZE, n));
      return [
        Math.round(clamp(x * scale) * 10) / 10,
        Math.round(clamp(y * scale) * 10) / 10,
      ];
    },
    [side]
  );

  const begin = useCallback(
    (x: number, y: number) => {
      if (value.strokes.length >= MAX_STROKES) return;
      const p = toCanvas(x, y);
      liveRef.current = [p];
      setLive([p]);
    },
    [toCanvas, value.strokes.length]
  );

  const extend = useCallback(
    (x: number, y: number) => {
      if (liveRef.current.length === 0) return;
      const p = toCanvas(x, y);
      const last = liveRef.current[liveRef.current.length - 1];
      if (!shouldKeepPoint(last, p)) return;
      liveRef.current = [...liveRef.current, p];
      setLive(liveRef.current);
    },
    [toCanvas]
  );

  const commit = useCallback(() => {
    const points = liveRef.current;
    liveRef.current = [];
    setLive([]);
    if (points.length === 0) return;
    const stroke: Stroke = { c: colorIndex, s: width, p: points };
    onChange({ ...value, strokes: [...value.strokes, stroke] });
  }, [colorIndex, width, value, onChange]);

  // runOnJS: the stroke lives in React state, so there is nothing to gain
  // from marshalling these through the UI thread first.
  //
  // manualActivation + activating on the first touch: with minDistance(0),
  // the built-in activation heuristic still expects some movement before it
  // commits to ACTIVE, so a tap that lands and lifts without ever moving can
  // fail to reach onEnd — dropping the very "dot" a crayon canvas needs to
  // support. Forcing activate() on touch-down guarantees the ACTIVE -> END
  // lifecycle always completes, tap or drag alike.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .averageTouches(true)
    .manualActivation(true)
    .onTouchesDown((_e, state) => state.activate())
    .onBegin((e) => begin(e.x, e.y))
    .onUpdate((e) => extend(e.x, e.y))
    .onEnd(commit)
    .onFinalize(commit);

  const undo = useCallback(() => {
    if (value.strokes.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange({ ...value, strokes: value.strokes.slice(0, -1) });
  }, [value, onChange]);

  const clear = useCallback(() => {
    if (value.strokes.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onChange({ ...value, strokes: [] });
  }, [value, onChange]);

  const drawn = useMemo<CrayonStroke[]>(
    () =>
      value.strokes
        .map((stroke) => ({
          d: strokeToPath(stroke.p),
          color: colorAt(stroke.c),
          width: stroke.s,
        }))
        .filter((s) => s.d !== ""),
    [value.strokes]
  );

  const liveStroke = useMemo<CrayonStroke | null>(() => {
    const d = strokeToPath(live);
    if (d === "") return null;
    return { d, color: colorAt(colorIndex), width };
  }, [live, colorIndex, width]);

  return (
    <View style={s.wrap}>
      <GestureDetector gesture={pan}>
        <View style={s.paper} onLayout={onLayout}>
          {side > 0 && (
            <Svg width={side} height={side} viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}>
              <CrayonStrokes strokes={drawn} live={liveStroke} />
            </Svg>
          )}
        </View>
      </GestureDetector>

      <View style={s.tray}>
        {CRAYON_COLORS.map((color, i) => (
          <TouchableOpacity
            key={color}
            onPress={() => setColorIndex(i)}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 6}
            accessibilityLabel={format(t.colorLabel, { n: i + 1 })}
            accessibilityState={{ selected: colorIndex === i }}
            style={[
              s.swatch,
              largeTouchTargets && s.swatchLarge,
              { backgroundColor: color },
              colorIndex === i && s.swatchActive,
            ]}
          />
        ))}
      </View>

      <View style={s.toolRow}>
        <View style={s.nibs}>
          {CRAYON_WIDTHS.map((w) => (
            <TouchableOpacity
              key={w}
              onPress={() => setWidth(w)}
              hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 6}
              accessibilityLabel={format(t.widthLabel, { n: w })}
              accessibilityState={{ selected: width === w }}
              style={[s.nib, width === w && s.nibActive]}
            >
              <View
                style={{
                  width: w + 4,
                  height: w + 4,
                  borderRadius: (w + 4) / 2,
                  backgroundColor: colorAt(colorIndex),
                }}
              />
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            onPress={undo}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 6}
            style={s.actionBtn}
            accessibilityLabel={t.undoLabel}
          >
            <Ionicons name="arrow-undo-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={clear}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 6}
            style={s.actionBtn}
            accessibilityLabel={t.clearLabel}
          >
            <Text style={s.clearText}>{t.clearText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    wrap: { gap: 14 },
    paper: {
      aspectRatio: 1,
      width: "100%",
      backgroundColor: colors.surfaceAlt,
      borderRadius: 4,
      overflow: "hidden",
      ...outlineOver(colors, colors.border),
    },
    tray: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
    swatch: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      borderColor: "transparent",
    },
    swatchLarge: { width: 38, height: 38, borderRadius: 19 },
    // The selected crayon gets a ring in the page colour plus a dark outline,
    // so the marker reads on light and dark swatches alike.
    swatchActive: {
      borderColor: colors.bg,
      shadowColor: colors.text,
      shadowOpacity: 0.9,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
      transform: [{ scale: 1.15 }],
    },
    toolRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    nibs: { flexDirection: "row", alignItems: "center", gap: 8 },
    nib: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "transparent",
    },
    nibActive: { borderColor: colors.border, backgroundColor: colors.surface },
    actions: { flexDirection: "row", alignItems: "center", gap: 12 },
    actionBtn: { paddingHorizontal: 8, paddingVertical: 6 },
    clearText: { fontSize: 14, color: colors.subtext },
  });
}
