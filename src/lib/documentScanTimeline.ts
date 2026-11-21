import { ease, passLook, type PassLook } from './previewMotion';

// ---------------------------------------------------------------------------
// The loop of the document intro's picture (screens/document/
// DocumentScanPreview): a band of light reads the document, a light green
// cover and a tick say it worked, and a two-sided document turns over, its
// back is read the same way, and it turns back. A one-sided document is read
// again after a rest. Pure: a function of the loop's own clock.
//
// The numbers are the web SDK's steps/DocumentScanPreview.tsx.
// ---------------------------------------------------------------------------

/** How the loop runs, in seconds. */
const SCAN = 1.6;
const PASS = 0.8;
const REST = 0.25;
const FLIP = 0.75;
/** One side: read it, the tick, a beat, turn it over. */
const SIDE = SCAN + PASS + REST + FLIP;
/** How long it takes to come in, once. */
export const SCAN_COMING_IN_S = 0.5;
/** How long the band of light fades in and out at the ends of a read. */
const BAND_FADE = 0.18;

/** Seconds one loop takes. */
export function scanLoopSeconds(twoSided: boolean): number {
  return twoSided ? SIDE * 2 : SCAN + PASS + REST * 3;
}

export interface ScanFrame {
  /** The band of light: how much shows, and how far down the document it is (0 to 1). */
  bandOpacity: number;
  bandAt: number;
  /** The document's turn, in degrees about its upright middle (0 the front, 180 the back). */
  angle: number;
  /** How far it lifts towards the camera as it turns, 0 to 1. */
  lift: number;
  /** The light it catches as it turns: how much shows, and where it is (the
   *  web's background position, 130% to -30%, as a share). */
  glintOpacity: number;
  glintAt: number;
  pass: PassLook;
}

/** When the tick is up within a loop: [on, off). */
function passSpans(twoSided: boolean): [number, number][] {
  const first: [number, number] = [SCAN, SCAN + PASS];
  return twoSided ? [first, [SIDE + SCAN, SIDE + SCAN + PASS]] : [first];
}

/** The picture `at` seconds into the loop. */
export function scanFrame(twoSided: boolean, at: number): ScanFrame {
  const t = twoSided ? at % SIDE : at;
  const onBack = twoSided && at >= SIDE;
  const reading = t >= 0 && t < SCAN;
  const turning = twoSided ? ease((t - SCAN - PASS - REST) / FLIP) : 0;
  const lift = Math.sin(Math.PI * turning);
  return {
    bandOpacity: reading ? Math.min(1, t / BAND_FADE, (SCAN - t) / BAND_FADE) : 0,
    bandAt: ease(Math.min(1, t / SCAN)),
    angle: (onBack ? 180 : 0) + 180 * turning,
    lift,
    glintOpacity: 0.9 * lift,
    glintAt: 1.3 - 1.6 * turning,
    pass: passLook(passSpans(twoSided), at),
  };
}

/** Whether the front faces the person at `angle` degrees (else the back does). */
export function frontShows(angle: number): boolean {
  return Math.cos((angle * Math.PI) / 180) > 0;
}

/** Coming in, once: a fade and a small settle, `at` seconds after it appeared. */
export function scanComingIn(at: number): { opacity: number; scale: number } {
  const arriving = Math.min(1, Math.max(0, at / SCAN_COMING_IN_S));
  return { opacity: arriving, scale: 0.94 + 0.06 * ease(arriving) };
}
