// ---------------------------------------------------------------------------
// How the instruction pill moves between lines, matching the Flutter SDK
// (lib/src/screens/liveness_instruction_pill.dart): an AnimatedSize around an
// AnimatedSwitcher.
//
//  - The pill eases to its new width over 220 ms on Curves.easeOutCubic,
//    growing and shrinking about its centre.
//  - The words crossfade over the same 220 ms: the new line fades in on
//    Curves.easeOut, and the old one fades out on Curves.easeIn run in
//    reverse, which in forward time is also an ease-out.
//  - While the two lines cross they are stacked, so the pill is as wide as the
//    wider of them. It grows at once, and shrinks only once the old line has
//    gone, so the old words are never clipped.
// ---------------------------------------------------------------------------

/** The duration of the width change and of the crossfade. */
export const PILL_MOTION_MS = 220;

/**
 * Room added to a measured line, in pixels. A line laid out at exactly its
 * measured width can still wrap its last word: the measure is rounded to the
 * pixel grid, and the text engine (TextKit on iOS especially) wants a hair
 * more than it reported.
 */
export const PILL_WIDTH_ALLOWANCE = 1;

/** Flutter's Curves.easeOutCubic, as cubic-bezier control points. */
export const PILL_SIZE_BEZIER = [0.215, 0.61, 0.355, 1] as const;

/** Flutter's Curves.easeOut, as cubic-bezier control points (CSS `ease-out`). */
export const PILL_FADE_BEZIER = [0, 0, 0.58, 1] as const;

/**
 * The width the pill's content box should have.
 *
 * `incoming` is the natural width of the line now shown, `outgoing` that of
 * the line fading out (null once it has gone, or under reduced motion). Null
 * while the incoming line is still unmeasured. Whole pixels, rounded up, plus
 * PILL_WIDTH_ALLOWANCE, so a line laid out at its own measured width never
 * wraps on a fraction.
 */
export function pillContentWidth(
  incoming: number | null | undefined,
  outgoing?: number | null,
): number | null {
  if (incoming == null || !Number.isFinite(incoming) || incoming <= 0) return null;
  const wider =
    outgoing != null && Number.isFinite(outgoing) && outgoing > incoming ? outgoing : incoming;
  return Math.ceil(wider) + PILL_WIDTH_ALLOWANCE;
}

/** How long a change takes: nothing at all under reduced motion. */
export function pillMotionMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : PILL_MOTION_MS;
}
