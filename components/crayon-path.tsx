import { Circle, Path } from "react-native-svg";

/**
 * Maskless line rendering: each stroke is a single SVG `Path`, stroked at its
 * nib width with round caps/joins. No blur, no grain mask, no core pass —
 * that rig looked good but was too heavy for real devices (iOS barely kept
 * up, Android worse), so drawings are back to plain crayon-coloured lines.
 *
 * A single-point stroke (a tap) is a filled `Circle` rather than a path:
 * iOS's path renderer has failed to produce a visible dot from every stroked
 * encoding tried (degenerate segment, hairline segment, tiny arc circle —
 * the last drew a hollow ring). A filled circle at half the nib width is the
 * same mark a round cap would leave, with no stroking machinery to misfire.
 */

export interface CrayonStroke {
  d: string;
  /** Set for single-point strokes; rendered as a filled dot instead of `d`. */
  dot?: [number, number] | null;
  color: string;
  width: number;
}

function CrayonMark({ stroke }: { stroke: CrayonStroke }) {
  if (stroke.dot) {
    const [cx, cy] = stroke.dot;
    return <Circle cx={cx} cy={cy} r={stroke.width / 2} fill={stroke.color} />;
  }
  return (
    <Path
      d={stroke.d}
      stroke={stroke.color}
      strokeWidth={stroke.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
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
        <CrayonMark key={i} stroke={stroke} />
      ))}
      {live && <CrayonMark stroke={live} />}
    </>
  );
}
