import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent, PixelRatio, Platform, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Image as SvgImage } from "react-native-svg";
import { CrayonStroke, CrayonStrokes } from "@/components/crayon-path";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import * as Haptics from "@/lib/haptics";
import {
  CANVAS_SIZE,
  CRAYON_COLORS,
  CRAYON_WIDTHS,
  colorAt,
  Drawing,
  MAX_STROKES,
  shouldKeepPoint,
  Stroke,
  strokeBounds,
  strokeToPath,
} from "@/lib/drawing";

interface DrawingCanvasProps {
  value: Drawing;
  onChange: (next: Drawing) => void;
}

/**
 * TUNING KNOB: how many un-baked strokes may pile up before the finished part
 * of the drawing is flattened to a bitmap.
 *
 * This is THE cost ceiling while drawing: un-baked strokes are redrawn on
 * every touch sample along with the live one, so a drag costs at most this
 * many blurred runs however full the picture already is. Lower it and drawing
 * gets cheaper but the PNG encode interrupts more often; raise it and lifts
 * are smoother but each frame does more.
 */
const SNAPSHOT_AFTER = 4;

/**
 * Size to hand `toDataURL`. The two platforms want DIFFERENT UNITS, and
 * getting it wrong doesn't warn — it silently produces a broken bitmap.
 *
 *   Android — `SvgView.drawChildren` rescales the viewBox to whatever bitmap
 *     it is handed, so this is a real pixel count and larger is sharper.
 *     Device density matches the view's own pixel size exactly.
 *   iOS — `getDataURLWithBounds` builds a UIGraphicsImageRenderer of
 *     `bounds.size` and then draws the view at its NATURAL geometry, with no
 *     scaling. So the value is in POINTS: pass the view's own size and the
 *     renderer applies screen scale for free. Passing pixels here yields a
 *     canvas 3x too large with the drawing stranded in one corner of it —
 *     and a ~9MP PNG that mostly fails to decode.
 *
 * Either way this only affects what the ARTIST sees while drawing. Strokes
 * are stored as vectors, so the sent letter is unaffected.
 */
const snapshotPixels = (side: number) =>
  Math.round(Platform.OS === "android" ? side * PixelRatio.get() : side);

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
  const s = makeStyles(colors);

  const [colorIndex, setColorIndex] = useState(0);
  const [width, setWidth] = useState<number>(CRAYON_WIDTHS[1]);
  const [side, setSide] = useState(0);
  const [live, setLive] = useState<[number, number][]>([]);
  const liveRef = useRef<[number, number][]>([]);

  /**
   * The finished part of the drawing, flattened to a bitmap. `count` is how
   * many of `value.strokes` it covers; the rest are still drawn as vectors.
   *
   * `ready` is only set once the bitmap has actually decoded and reported
   * back. Until then the strokes it replaces keep being drawn, so a bake that
   * silently produces something unusable costs frame rate, never the picture.
   * Getting this wrong wipes the canvas, which is exactly what a size in the
   * wrong units did — see `snapshotPixels`.
   */
  const [snapshot, setSnapshot] = useState<
    { uri: string; count: number; ready: boolean } | null
  >(null);
  const baseRef = useRef<Svg | null>(null);
  const baking = useRef(false);

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
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .averageTouches(true)
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

  // Committed strokes are memoised so a touch sample doesn't rebuild (and
  // re-blur) the whole drawing — only the live stroke below changes mid-drag.
  const drawn = useMemo<CrayonStroke[]>(
    () =>
      value.strokes
        .map((stroke) => ({
          d: strokeToPath(stroke.p),
          color: colorAt(stroke.c),
          width: stroke.s,
          bounds: strokeBounds(stroke.p),
        }))
        .filter((s) => s.d !== ""),
    [value.strokes]
  );

  const liveStroke = useMemo<CrayonStroke | null>(() => {
    const d = strokeToPath(live);
    if (d === "") return null;
    return { d, color: colorAt(colorIndex), width, bounds: strokeBounds(live) };
  }, [live, colorIndex, width]);

  // Strokes already flattened into `snapshot`, and the ones drawn since. An
  // unconfirmed bitmap replaces nothing, so `pending` stays the whole drawing.
  const bakedCount = snapshot?.ready ? snapshot.count : 0;
  const pending = useMemo(() => drawn.slice(bakedCount), [drawn, bakedCount]);

  /**
   * Fold the finished strokes down to a bitmap.
   *
   * The base layer already contains the PREVIOUS bitmap plus whatever has
   * been drawn since, so re-baking it is O(1) in the size of the drawing
   * rather than O(strokes) — a 200-stroke picture bakes as fast as a
   * 10-stroke one, and costs the same to display afterwards.
   */
  useEffect(() => {
    if (side <= 0) return;
    const total = value.strokes.length;

    // Undo or clear: indices no longer line up with what was baked, so throw
    // the bitmap away and let the next bake rebuild it from the live strokes.
    if (snapshot && snapshot.count > total) {
      setSnapshot(null);
      return;
    }
    // A bitmap that never confirmed is a bitmap that didn't work. Stop baking
    // rather than burning an encode per stroke on something unusable — the
    // drawing stays fully vector, which is slower but always right.
    if (snapshot && !snapshot.ready) return;
    if (total - bakedCount < SNAPSHOT_AFTER) return;
    if (baking.current) return;
    // Never bake mid-stroke: the in-progress line is on the canvas, so it
    // would be flattened in AND then committed again on release, drawing it
    // twice. Reading the ref rather than `live` keeps this off the dependency
    // list — the next commit re-runs the effect anyway.
    if (liveRef.current.length > 0) return;

    baking.current = true;
    const at = total;
    const px = snapshotPixels(side);
    baseRef.current?.toDataURL(
      (base64) => {
        baking.current = false;
        // Strokes drawn while this was encoding stay pending — `at` records
        // exactly what the bitmap contains, so nothing is dropped or doubled.
        if (!base64) {
          baking.current = true; // nothing came back; don't retry every stroke
          return;
        }
        setSnapshot({ uri: `data:image/png;base64,${base64}`, count: at, ready: false });
      },
      { width: px, height: px }
    );
  }, [value.strokes.length, side, snapshot, bakedCount]);

  return (
    <View style={s.wrap}>
      <GestureDetector gesture={pan}>
        <View style={s.paper} onLayout={onLayout}>
          {side > 0 && (
            /* One canvas, three things: the baked bitmap, the strokes drawn
               since it was baked, and the one in progress. Splitting the live
               stroke into its own stacked <Svg> would be cheaper still, but
               it would sit above ALL the older wax and then drop behind it on
               release — the settle is worse than the frames it saves. Keeping
               one canvas preserves the exact paint order, and the bitmap caps
               what has to be redrawn at SNAPSHOT_AFTER strokes no matter how
               full the picture gets. */
            <Svg
              ref={baseRef}
              width={side}
              height={side}
              viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            >
              {snapshot && (
                /* Held at zero opacity until it decodes: it has to be in the
                   tree to load at all, but the strokes it stands in for are
                   still being drawn until then, and painting both would
                   double the wax. */
                <SvgImage
                  href={{ uri: snapshot.uri }}
                  x={0}
                  y={0}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  preserveAspectRatio="none"
                  opacity={snapshot.ready ? 1 : 0}
                  onLoad={() =>
                    setSnapshot((s) => (s && !s.ready ? { ...s, ready: true } : s))
                  }
                />
              )}
              {/* The grain tiles in canvas units, so a stroke lands on exactly
                  the fibres it will still be on once it's been baked in. */}
              <CrayonStrokes strokes={pending} live={liveStroke} />
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
            accessibilityLabel={`Spalva ${i + 1}`}
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
              accessibilityLabel={`Storis ${w}`}
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
            accessibilityLabel="Atšaukti paskutinį brūkšnį"
          >
            <Ionicons name="arrow-undo-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={clear}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 6}
            style={s.actionBtn}
            accessibilityLabel="Išvalyti piešinį"
          >
            <Text style={s.clearText}>Išvalyti</Text>
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
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
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
