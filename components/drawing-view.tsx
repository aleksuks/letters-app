import { useMemo } from "react";
import { View, ViewStyle } from "react-native";
import Svg from "react-native-svg";
import { CrayonStroke, CrayonStrokes } from "@/components/crayon-path";
import { colorAt, Drawing, isValidDrawing, strokeToPath } from "@/lib/drawing";

interface DrawingViewProps {
  drawing: unknown;
  /** Rendered edge length in px. Strokes scale from the stored canvas size. */
  size: number;
  style?: ViewStyle;
}

/**
 * Read-only render of a stored crayon drawing. Line rendering itself lives
 * in `CrayonPath`, shared with the editor so a drawing looks identical while
 * it's being made and after it's sent.
 */
export function DrawingView({ drawing, size, style }: DrawingViewProps) {
  const parsed = useMemo<Drawing | null>(
    () => (isValidDrawing(drawing) ? drawing : null),
    [drawing]
  );

  const drawn = useMemo<CrayonStroke[]>(() => {
    if (!parsed) return [];
    return parsed.strokes
      .map((stroke) => ({
        d: strokeToPath(stroke.p),
        color: colorAt(stroke.c),
        width: stroke.s,
      }))
      .filter((s) => s.d !== "");
  }, [parsed]);

  if (!parsed || parsed.strokes.length === 0) return null;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${parsed.w} ${parsed.h}`}>
        <CrayonStrokes strokes={drawn} />
      </Svg>
    </View>
  );
}
