import { Path } from "react-native-svg";

/**
 * Maskless line rendering: each stroke is a single SVG `Path`, stroked at its
 * nib width with round caps/joins. No blur, no grain mask, no core pass —
 * that rig looked good but was too heavy for real devices (iOS barely kept
 * up, Android worse), so drawings are back to plain crayon-coloured lines.
 */

export interface CrayonStroke {
  d: string;
  color: string;
  width: number;
}

export function CrayonStrokes({
  strokes,
  live,
}: {
  strokes: CrayonStroke[];
  /** The in-progress stroke, drawn on top of the committed ones. */
  live?: CrayonStroke | null;
}) {
  return (
    <>
      {strokes.map((stroke, i) => (
        <Path
          key={i}
          d={stroke.d}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      {live && (
        <Path
          d={live.d}
          stroke={live.color}
          strokeWidth={live.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
    </>
  );
}
