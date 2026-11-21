// ---------------------------------------------------------------------------
// What the two intro pictures share (the liveness GesturePreview and the
// document DocumentScanPreview): easing curves, the tick and the light green
// cover that say a step worked, and the way a timeline is handed to React
// Native's Animated.
//
// The web SDK writes each frame from requestAnimationFrame and lets CSS
// transitions ease the tick and the cover. Here each picture's loop is a pure
// function of its own clock, sampled into an interpolation that runs on the
// native driver: the JS thread does nothing while it plays, which matters on
// a screen that comes right before the camera.
// ---------------------------------------------------------------------------

/** Smooth from 0 to 1 over [0, 1]. */
export const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.cos(Math.PI * t)) / 2);
/** Smooth from 0 to 1 and back to 0 over [0, 1]. */
export const swell = (t: number): number => (t <= 0 || t >= 1 ? 0 : (1 - Math.cos(2 * Math.PI * t)) / 2);

/** CSS's `cubic-bezier(x1, y1, x2, y2)` as a function of progress, 0 to 1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number): number => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // The curve's own parameter for this x, by halving: x rises with it.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

/** The tick's pop: a little past its size and back. */
const POP = cubicBezier(0.34, 1.56, 0.64, 1);
/** CSS's `ease-out`, the cover's fade. */
const EASE_OUT = cubicBezier(0, 0, 0.58, 1);

/** How long the tick takes to pop (and to drop away), its fade, and the cover's fade. */
export const TICK_POP_S = 0.16;
const TICK_FADE_S = 0.09;
const COVER_FADE_S = 0.14;

/** A step worked: the light green cover over the picture and the tick. */
export interface PassLook {
  cover: number;
  tickOpacity: number;
  tickScale: number;
}

/**
 * The cover and the tick at `at`, for the spans of a loop in which a step
 * has just worked (`[on, off)`, in order, none overlapping). Each change is
 * eased as the web's CSS transitions ease it, both ways.
 */
export function passLook(spans: readonly (readonly [number, number])[], at: number): PassLook {
  let since: { on: boolean; at: number } | null = null;
  for (const [on, off] of spans) {
    if (at >= on) since = { on: true, at: on };
    if (at >= off) since = { on: false, at: off };
  }
  if (!since) return { cover: 0, tickOpacity: 0, tickScale: 0.4 };
  const s = at - since.at;
  const pop = POP(Math.min(1, s / TICK_POP_S));
  const fade = Math.min(1, s / TICK_FADE_S);
  const cover = EASE_OUT(Math.min(1, s / COVER_FADE_S));
  return since.on
    ? { cover, tickOpacity: fade, tickScale: 0.4 + 0.6 * pop }
    : { cover: 1 - cover, tickOpacity: 1 - fade, tickScale: 1 - 0.6 * pop };
}

/** Samples a second: enough that the native interpolation between them is
 *  smooth, the tick's pop included. */
const SAMPLES_PER_SECOND = 60;

/**
 * A timeline over [0, `seconds`] as an Animated interpolation's ranges: an
 * Animated.Value run from 0 to `seconds` and interpolated with these plays it.
 */
export function sampledTrack<T extends number | string>(
  seconds: number,
  value: (at: number) => T,
): { inputRange: number[]; outputRange: T[] } {
  const steps = Math.max(1, Math.ceil(seconds * SAMPLES_PER_SECOND));
  const inputRange: number[] = [];
  const outputRange: T[] = [];
  for (let i = 0; i <= steps; i++) {
    const at = (i / steps) * seconds;
    inputRange.push(at);
    outputRange.push(value(at));
  }
  return { inputRange, outputRange };
}
