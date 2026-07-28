/**
 * Crayon drawings: the shared stroke model, palette, and SVG path building
 * used by both the canvas (writing) and the viewer (reading).
 *
 * Strokes are stored, not pixels — see migration 038 for the rationale and
 * the wire format. Everything here is deliberately small and dependency-free
 * so the same module serves the editor, the read screen, and the map.
 */

/** Logical canvas the strokes are recorded against. Readers scale from this. */
export const CANVAS_SIZE = 320;

/**
 * TUNING KNOB: the eight crayons. Waxy, slightly muted colours chosen to sit
 * on the app's warm paper rather than fight it — no pure primaries, nothing
 * that glows against #F3EDE1. Eight fits one comfortable row of swatches and
 * covers the spectrum without offering four near-identical browns.
 *
 * Stored drawings reference these by index, so entries may be re-tinted
 * freely, but an existing index must never be repurposed for a different
 * colour and the array must never be reordered — old drawings would repaint
 * themselves. (`colorAt` falls back to index 0 for anything out of range, so
 * shrinking the list degrades gracefully rather than crashing.)
 */
export const CRAYON_COLORS = [
  "#2B2320", // graphite
  "#96150D", // the app's red
  "#C2571A", // burnt orange
  "#D8A02B", // ochre
  "#5C7A33", // moss
  "#2E6B63", // teal
  "#2C4C7C", // ink blue
  "#B5567F", // rose
] as const;

/** TUNING KNOB: crayon nib sizes offered in the tray. */
export const CRAYON_WIDTHS = [4, 9, 16] as const;

/** TUNING KNOB: strokes kept per drawing. Guards the payload size cap. */
export const MAX_STROKES = 400;

export interface Stroke {
  /** Index into CRAYON_COLORS. */
  c: number;
  /** Stroke width in canvas units. */
  s: number;
  /** Points, as [x, y] pairs in canvas units. */
  p: [number, number][];
}

export interface Drawing {
  v: 1;
  w: number;
  h: number;
  strokes: Stroke[];
}

export function emptyDrawing(): Drawing {
  return { v: 1, w: CANVAS_SIZE, h: CANVAS_SIZE, strokes: [] };
}

export function isDrawingEmpty(d: Drawing | null | undefined): boolean {
  return !d || d.strokes.length === 0;
}

export function colorAt(index: number): string {
  return CRAYON_COLORS[index] ?? CRAYON_COLORS[0];
}

/**
 * Points -> SVG path. A single point becomes a dot (a zero-length line with
 * round caps), which is what a tap on the canvas should leave behind.
 *
 * Segments are joined with quadratic curves through the midpoints of
 * consecutive samples, which smooths the polyline the touch stream actually
 * produces without needing to store more points than were sampled.
 */
export function strokeToPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x} ${y} L ${x} ${y}`;
  }

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

/**
 * Drops points that fall within `min` units of the previously kept one. The
 * touch stream samples far denser than a crayon line needs, and thinning it
 * at capture time is what keeps a full drawing in the low kilobytes.
 */
export function shouldKeepPoint(
  last: [number, number] | undefined,
  next: [number, number],
  min = 2.5
): boolean {
  if (!last) return true;
  const dx = next[0] - last[0];
  const dy = next[1] - last[1];
  return dx * dx + dy * dy >= min * min;
}

/**
 * Server-side shape validation lives in a CHECK constraint; this is the
 * client's guard against rendering junk it was handed (a hand-rolled client,
 * a future format change, a truncated row).
 */
export function isValidDrawing(value: unknown): value is Drawing {
  if (!value || typeof value !== "object") return false;
  const d = value as Drawing;
  if (d.v !== 1) return false;
  if (typeof d.w !== "number" || typeof d.h !== "number") return false;
  if (d.w <= 0 || d.h <= 0) return false;
  if (!Array.isArray(d.strokes)) return false;
  return d.strokes.every(
    (s) =>
      s &&
      typeof s.c === "number" &&
      typeof s.s === "number" &&
      Array.isArray(s.p) &&
      s.p.every((pt) => Array.isArray(pt) && pt.length === 2 &&
        typeof pt[0] === "number" && typeof pt[1] === "number")
  );
}
