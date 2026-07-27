import { memo, useMemo } from "react";
import {
  Defs,
  FeColorMatrix,
  FeGaussianBlur,
  Filter,
  G,
  Image as SvgImage,
  Mask,
  Path,
  Pattern,
  Rect,
} from "react-native-svg";
import { Bounds } from "@/lib/drawing";

/**
 * Crayon rendering: blurred wax on tiled paper tooth, in two passes.
 *
 * A crayon line has no edge — wax density is highest where the tip actually
 * travelled and thins with distance until there's none. An early version
 * approximated that by stroking the same path four times, each pass wider,
 * fainter and sparser than the last. Four samples of a smooth curve is not a
 * smooth curve: the steps between passes were visible as concentric bands,
 * and stacking them out to 4x the nib made every line far too wide.
 *
 * So the falloff is no longer sampled — it's computed. The path is stroked
 * ONCE per pass at the nib width and run through a Gaussian blur, which is
 * continuous by construction. There is no banding to tune away because there
 * are no bands.
 *
 * A raw blur alone is too soft and too far-reaching, so the alpha is then put
 * through a linear remap (`FeColorMatrix`, alpha row `GAIN` with a negative
 * offset `CUT`):
 *
 *     a' = clamp(GAIN * a - CUT, 0, 1)
 *
 * The negative offset is what tightens the stroke: everything below
 * `CUT / GAIN` falls to zero, cutting off the long faint tail that made the
 * old stroke read as a smudge, while `GAIN` pushes the middle back up into a
 * solid core. Still perfectly smooth — it's a straight line through the
 * alpha values, not a step function.
 *
 * The paper tooth is a tiled mask: it tiles in canvas space, so the grain
 * belongs to the *paper* and two lines crossing the same patch skip the same
 * fibres. It no longer has to carry the falloff, so ONE texture replaces the
 * four of descending density. Generated, not downloaded —
 * scripts/generate-crayon-grain.mjs.
 *
 * That texture is masked in at two strengths, because opacity alone can't
 * make the middle of a stroke denser — see the CORE_* knobs below.
 *
 * EVERYTHING IS SIZED TO THE STROKES, not to the page. Filter and mask
 * regions are both properties of the referenced element, so anything shared
 * across a drawing has to cover the worst case — the whole canvas — and a
 * 20-unit flick then costs the same as a stroke crossing the page. So the
 * defs are emitted here, next to the strokes that use them, rather than by a
 * separate component that never sees them.
 *
 * Note on the toolbox: react-native-svg implements only feBlend,
 * feColorMatrix, feComposite, feDropShadow, feFlood, feGaussianBlur, feMerge
 * and feOffset natively. feTurbulence and feComponentTransfer are TypeScript
 * stubs that silently render nothing, so procedural noise and gamma curves
 * are not on the table — hence the tiled PNG and the linear remap above.
 *
 * Ids only need to be unique within one <Svg> root, and one root holds one
 * drawing, so the fixed names below never collide.
 */

const GRAIN = require("@/assets/images/crayon-grain.png");

// TUNING KNOBS. All three shape the cross-section of a stroke and are worth
// adjusting in this order:
//
//   SPREAD — Gaussian sigma as a multiple of the nib width. THE width knob.
//            Raise for more spray, lower for a crisper line. Visible reach
//            works out to roughly (0.5 + SPREAD) * nib either side of centre.
//   CUT    — how much of the faint tail is erased. Raise to tighten the
//            stroke without softening its core; at 0 you get the raw blur,
//            tail and all. NOTE: also sets how much room the blur needs —
//            see BLUR_REACH.
//   GAIN   — how hard the surviving alpha is pushed back up. Raise for a
//            more solid core, lower for a more translucent one. Above ~2.5
//            the core clamps flat over most of its width and starts to read
//            as marker pen again.
const SPREAD = 0.45;
const GAIN = 1.9;
const CUT = 0.28;

/** Final darkness of the wax at the core, before the grain eats into it. */
const INK = 0.88;

/**
 * THE CORE PASS. A single mask eats the same fraction of wax everywhere, so
 * raising the alpha in the middle of a stroke only makes the specks darker —
 * the holes stay exactly as wide. Wax laid down by a real crayon fills the
 * paper's tooth where the tip pressed hardest and only catches the high
 * fibres out at the edges, so density has to vary, not just opacity.
 *
 * So the stroke is laid down twice: the spray above, then a second, much
 * tighter pass through a mask whose tooth is mostly filled in
 * (`CORE_GRAIN_LIFT`). Where the two overlap the holes close up; further out
 * the core has faded to nothing and the spray's full tooth is all that's
 * left. Both are Gaussians, so their sum is smooth and there's no boundary
 * where one takes over from the other.
 *
 *   CORE_SPREAD     — how far the dense middle reaches. Keep it well under
 *                     SPREAD or the core swallows the sprayed edge and the
 *                     stroke goes back to looking like a marker.
 *   CORE_GRAIN_LIFT — how much of the tooth the core fills. 0 gives the core
 *                     the same grain as the spray (i.e. no density change at
 *                     all); 1 makes the middle perfectly solid.
 *   CORE_FILL       — overall strength of the pass. SET THIS TO 0 to skip
 *                     the second pass entirely and halve the render cost.
 */
const CORE_SPREAD = 0.16;
const CORE_GAIN = 2.2;
const CORE_CUT = 0.35;
const CORE_GRAIN_LIFT = 0.55;
const CORE_FILL: number = 0.72;

/** Grain repeat in canvas units. Larger = bigger, more visible flecks. */
const GRAIN_TILE = 128;

/**
 * Sigmas of blur a region has to leave room for.
 *
 * This is NOT the 3 sigma a Gaussian is usually given, because `CUT` erases
 * everything below `CUT / GAIN` before it is ever drawn. At the edge of a
 * stroke the blurred alpha falls off as erfc, so it is already under that
 * threshold by ~1.05 sigma; 2 leaves a comfortable margin over both that and
 * the box-blur approximation engines actually use.
 *
 * Raise it if you ever lower CUT far — a region that clips before the wax has
 * faded shows a hard straight edge where the stroke is cut off.
 */
const BLUR_REACH = 2;

/**
 * TUNING KNOB: how much wasted filter area merging a stroke into the previous
 * run may cost before it's cheaper to give it a pass of its own.
 *
 * Batching strokes into one pass is only a saving while they sit near each
 * other — two same-coloured strokes in opposite corners would share a filter
 * region covering the whole canvas, which is exactly the cost this is trying
 * to avoid. Splitting them is visually free: runs are only ever split when
 * the strokes are far apart, and far-apart strokes don't overlap, so it makes
 * no difference whether they were blurred together or separately.
 */
const RUN_MERGE_SLACK = 2;

const MASK_ID = "crayonGrainMask";
const CORE_MASK_ID = "crayonCoreMask";
const PATTERN_ID = "crayonGrainPattern";

type Pass = "spray" | "core";

const filterId = (pass: Pass, prefix: string, index: number) =>
  `crayon_${pass}_${prefix}${index}`;

export interface CrayonStroke {
  d: string;
  color: string;
  width: number;
  /** Centreline bounds, from `strokeBounds`. Sizes this stroke's filter. */
  bounds: Bounds;
}

interface Run {
  width: number;
  color: string;
  bounds: Bounds;
  strokes: CrayonStroke[];
}

const union = (a: Bounds, b: Bounds): Bounds => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];

/** Padded so a perfectly straight line doesn't measure as zero area. */
const area = (b: Bounds, pad: number) => (b[2] - b[0] + pad) * (b[3] - b[1] + pad);

/** How far past its centreline a stroke of this width actually paints. */
const reachOf = (width: number, spread: number) =>
  width / 2 + width * spread * BLUR_REACH;

/**
 * Strokes are batched into runs of consecutive same-colour, same-nib lines so
 * a whole run costs one blur pass instead of one per stroke. Runs are
 * CONSECUTIVE rather than grouped by colour outright, because grouping would
 * reorder the drawing — every red line would land under every blue one
 * regardless of which was drawn first.
 *
 * Splitting on colour as well as nib matters: the blur runs over whatever the
 * group composites to, so a red and a blue line sharing one pass would bleed
 * into a purple fringe where they cross.
 */
function toRuns(strokes: CrayonStroke[]): Run[] {
  const runs: Run[] = [];
  for (const stroke of strokes) {
    const last = runs[runs.length - 1];
    if (last && last.width === stroke.width && last.color === stroke.color) {
      const merged = union(last.bounds, stroke.bounds);
      const pad = stroke.width;
      const wasteful =
        area(merged, pad) >
        (area(last.bounds, pad) + area(stroke.bounds, pad)) * RUN_MERGE_SLACK;
      if (!wasteful) {
        last.strokes.push(stroke);
        last.bounds = merged;
        continue;
      }
    }
    runs.push({
      width: stroke.width,
      color: stroke.color,
      bounds: stroke.bounds,
      strokes: [stroke],
    });
  }
  return runs;
}

/**
 * Area every run of a pass paints into, for sizing that pass's mask.
 *
 * Snapped outward to a grid, because the live stroke is inside the mask too:
 * without snapping, the region would grow by a unit or two on most touch
 * samples and the mask would be rebuilt every frame for no visual gain. On a
 * grid it only changes when the stroke crosses into a new cell, so the props
 * stay identical and the native mask is left alone.
 */
const REGION_QUANTUM = 32;

function regionOf(runs: Run[], spread: number): Bounds | null {
  let box: Bounds | null = null;
  let margin = 0;
  for (const run of runs) {
    box = box ? union(box, run.bounds) : run.bounds;
    margin = Math.max(margin, reachOf(run.width, spread));
  }
  if (!box) return null;
  const q = REGION_QUANTUM;
  return [
    Math.floor((box[0] - margin) / q) * q,
    Math.floor((box[1] - margin) / q) * q,
    Math.ceil((box[2] + margin) / q) * q,
    Math.ceil((box[3] + margin) / q) * q,
  ];
}

/**
 * Paper tooth, scoped to where the wax actually lands.
 *
 * The pattern tiles in absolute canvas units, so shrinking the mask's region
 * does NOT slide the grain — a stroke sits on exactly the fibres it would
 * have sat on if the mask still covered the page. It only stops the renderer
 * from allocating and filling a page-sized buffer to mask a doodle in one
 * corner, which (once the filter regions shrank) had become the single
 * biggest cost in the whole component.
 *
 * `ink` is folded in here rather than applied as a third filter primitive:
 * multiplying the mask is exactly equivalent to multiplying the alpha, and it
 * costs nothing, whereas a per-run FeColorMatrix costs a full extra pass over
 * every run's region.
 */
function GrainMask({
  id,
  region,
  ink,
  lift,
}: {
  id: string;
  region: Bounds;
  ink: number;
  /** How far the tooth is filled toward solid, for the core pass. */
  lift?: number;
}) {
  const [x, y, maxX, maxY] = region;
  const width = maxX - x;
  const height = maxY - y;
  return (
    <Mask id={id} x={x} y={y} width={width} height={height} maskUnits="userSpaceOnUse">
      <G opacity={ink}>
        <Rect x={x} y={y} width={width} height={height} fill={`url(#${PATTERN_ID})`} />
        {lift ? (
          <Rect x={x} y={y} width={width} height={height} fill="#fff" opacity={lift} />
        ) : null}
      </G>
    </Mask>
  );
}

/**
 * One filter per run, sized to that run rather than to the page.
 *
 * Two primitives, not three: the blur, then the tightening remap. The final
 * "how dark" multiply lives in the mask instead (see GrainMask).
 */
function RunFilters({
  runs,
  pass,
  prefix,
}: {
  runs: Run[];
  pass: Pass;
  prefix: string;
}) {
  const core = pass === "core";
  const spread = core ? CORE_SPREAD : SPREAD;
  const gain = core ? CORE_GAIN : GAIN;
  const cut = core ? CORE_CUT : CUT;

  return (
    <Defs>
      {runs.map((run, i) => {
        const sigma = run.width * spread;
        const margin = reachOf(run.width, spread);
        const [minX, minY, maxX, maxY] = run.bounds;
        return (
          <Filter
            key={i}
            id={filterId(pass, prefix, i)}
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            x={minX - margin}
            y={minY - margin}
            width={maxX - minX + margin * 2}
            height={maxY - minY + margin * 2}
          >
            <FeGaussianBlur in="SourceGraphic" stdDeviation={sigma} result="spread" />
            {/* Tighten: erase the tail, push the core back up. Rows are RGBA
                plus an offset column; only the alpha row does any work. */}
            <FeColorMatrix
              in="spread"
              type="matrix"
              values={[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, gain, -cut]}
            />
          </Filter>
        );
      })}
    </Defs>
  );
}

function RunGroups({
  runs,
  pass,
  prefix,
}: {
  runs: Run[];
  pass: Pass;
  prefix: string;
}) {
  return (
    <>
      {runs.map((run, i) => (
        <G key={i} filter={`url(#${filterId(pass, prefix, i)})`}>
          {run.strokes.map((stroke, j) => (
            <Path
              key={j}
              d={stroke.d}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </G>
      ))}
    </>
  );
}

/**
 * Committed strokes don't change while a new one is being drawn, so they're
 * memoised away from the live stroke — otherwise every touch sample would
 * re-run the blur over the entire drawing, which is what made a half-full
 * canvas crawl. Callers must keep `strokes` referentially stable (both call
 * sites build it with useMemo).
 */
const CommittedFilters = memo(RunFilters);
const CommittedGroups = memo(RunGroups);

export function CrayonStrokes({
  strokes,
  live,
}: {
  strokes: CrayonStroke[];
  /** The in-progress stroke, kept in its own pass so it alone re-filters. */
  live?: CrayonStroke | null;
}) {
  const committed = useMemo(() => toRuns(strokes), [strokes]);
  const liveRuns = useMemo(() => (live ? toRuns([live]) : []), [live]);

  // Masks cover both, since both are drawn inside them.
  const all = useMemo(() => [...committed, ...liveRuns], [committed, liveRuns]);
  const sprayRegion = useMemo(() => regionOf(all, SPREAD), [all]);
  const coreRegion = useMemo(() => regionOf(all, CORE_SPREAD), [all]);

  if (!sprayRegion || !coreRegion) return null;

  return (
    <>
      <Defs>
        <Pattern
          id={PATTERN_ID}
          width={GRAIN_TILE}
          height={GRAIN_TILE}
          patternUnits="userSpaceOnUse"
        >
          <SvgImage
            href={GRAIN}
            x={0}
            y={0}
            width={GRAIN_TILE}
            height={GRAIN_TILE}
            preserveAspectRatio="xMidYMid slice"
          />
        </Pattern>

        <GrainMask id={MASK_ID} region={sprayRegion} ink={INK} />
        {/* Lifting the one texture rather than generating a second keeps both
            passes following the SAME fibres — a separate noise field would
            read as a different material laid on top. */}
        {CORE_FILL > 0 && (
          <GrainMask
            id={CORE_MASK_ID}
            region={coreRegion}
            ink={INK * CORE_FILL}
            lift={CORE_GRAIN_LIFT}
          />
        )}
      </Defs>

      <CommittedFilters runs={committed} pass="spray" prefix="c" />
      <RunFilters runs={liveRuns} pass="spray" prefix="l" />
      {CORE_FILL > 0 && (
        <>
          <CommittedFilters runs={committed} pass="core" prefix="c" />
          <RunFilters runs={liveRuns} pass="core" prefix="l" />
        </>
      )}

      <G mask={`url(#${MASK_ID})`}>
        <CommittedGroups runs={committed} pass="spray" prefix="c" />
        {/* On release this merges into a run and is blurred together with its
            neighbours rather than separately, so a stroke laid across another
            of the same colour settles a touch differently than it looked mid-
            drag. Only visible where a stroke overlaps itself or its own run. */}
        <RunGroups runs={liveRuns} pass="spray" prefix="l" />
      </G>

      {/* Laid over the spray, never under it — the dense middle is the wax
          that went down last and sits on top of the tooth, not beneath. */}
      {CORE_FILL > 0 && (
        <G mask={`url(#${CORE_MASK_ID})`}>
          <CommittedGroups runs={committed} pass="core" prefix="c" />
          <RunGroups runs={liveRuns} pass="core" prefix="l" />
        </G>
      )}
    </>
  );
}
