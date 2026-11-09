import { NitroModules } from 'react-native-nitro-modules';
import type { BoxedHybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

import type { DetectedRect, MyazaRectDetector } from '../specs/MyazaRectDetector.nitro';

// ---------------------------------------------------------------------------
// Document EDGE detection — the geometry half of auto-capture.
//
// Apple Vision on iOS, the SDK's own border detector on Android. The corners it
// reports drive the four-corner capture gate (cornerGate.ts). When there is no
// detector to ask, the reading says `unavailable`, and the gate steps aside so
// a platform without geometry captures exactly as it did before.
//
// Geometry NEVER decides alone. An aspect ratio cannot tell a passport from a
// driver's licence, so a capture that fired on shape would shoot the wrong
// document — the text gate is what establishes identity, and this only says
// whether what's there is presented like a document.
// ---------------------------------------------------------------------------

/**
 * Resolved LAZILY and re-tried until it appears.
 *
 * Creating it at module load fails silently and permanently when this module
 * evaluates before Nitro's registry is populated (Fast Refresh does this): the
 * reference stays null for the session and the geometry gate silently becomes a
 * no-op, which is indistinguishable from a platform that has no detector.
 *
 * The BOXED handle is what the worklet unboxes, so it is created alongside on
 * the JS thread — a worklet cannot construct one itself.
 */
function create(): MyazaRectDetector | null {
  try {
    return NitroModules.hasHybridObject('MyazaRectDetector')
      ? NitroModules.createHybridObject<MyazaRectDetector>('MyazaRectDetector')
      : null;
  } catch {
    return null;
  }
}

// EAGER, and it has to be — the worklet captures `boxed` at creation, so a null
// there is permanent on the camera thread and every frame reports no rectangle.
let detector: MyazaRectDetector | null = create();
// `let`, not `const`: if the eager create above ran before Nitro's registry was
// populated, `resolve()` re-creates AND re-boxes. Leaving this const meant a
// late resolution produced a working JS-side module with a null worklet handle
// — the camera thread stayed blind while everything looked fine from JS.
let boxed: BoxedHybridObject<MyazaRectDetector> | null = detector ? NitroModules.box(detector) : null;

function resolve(): MyazaRectDetector | null {
  if (!detector) {
    detector = create();
    if (detector) boxed = NitroModules.box(detector);
  }
  return detector;
}

/**
 * Tell the detector whether the document is framed upright (a NIN slip on a
 * phone held upright, documentTurn.ts). Android's border search admits one
 * orientation at a time. An app whose native build lacks the method keeps the
 * landscape search; nothing else changes.
 */
export function setRectDetectorUpright(upright: boolean): void {
  try {
    resolve()?.setExpectUpright(upright);
  } catch {
    /* an older native build: landscape only, as before */
  }
}

/**
 * Whether this build can measure document edges at all.
 *
 * Also the WARM-UP: calling it resolves the module on the JS thread so the
 * boxed handle exists before the first frame reaches the worklet.
 */
export function hasRectDetector(): boolean {
  return resolve() !== null;
}

/** A reading, plus whether there was a detector to take it at all. */
export type RectReading = DetectedRect & { unavailable?: boolean };

const UNAVAILABLE: RectReading = {
  found: false, x: 0, y: 0, width: 0, height: 0, aspect: 0, confidence: 0,
  topLeftX: 0, topLeftY: 0, topRightX: 0, topRightY: 0,
  bottomRightX: 0, bottomRightY: 0, bottomLeftX: 0, bottomLeftY: 0,
  frameWidth: 0, frameHeight: 0,
  unavailable: true,
};

/**
 * Measure the document-like rectangle in a frame. A WORKLET.
 *
 * No module, or one that throws, is UNAVAILABLE rather than "nothing found":
 * the corner gate must not hold capture behind a check that cannot run.
 */
export function detectRectOnFrame(frame: Frame): RectReading {
  'worklet';
  if (boxed == null) return UNAVAILABLE;
  try {
    return boxed.unbox().detectRect(frame);
  } catch {
    return UNAVAILABLE;
  }
}

export { rectFramingProblem, type RectGateOptions, type MeasuredRect } from './rectGate';
