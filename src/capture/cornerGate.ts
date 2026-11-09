import { coverVisibleRegion } from '../services/cardCrop';
import { cornersProblem, exceedsGuide, type CornersProblem, type DocumentQuad } from './documentCorners';
import type { DocumentHint } from './documentIdentity';

// ---------------------------------------------------------------------------
// From a native rectangle reading to a capture decision: the PURE half of the
// four-corner gate (the hook that holds its state is useCornerGate.ts).
//
// "Unavailable" is kept apart from "nothing found" on purpose. A build without
// the native detector (or a JS update running on an older native binary, which
// reports no corners at all) must capture exactly as before, so nobody is
// stranded behind a check their phone cannot run. "Nothing found" on a working
// detector is the opposite: the document is not in frame, so capture waits.
// ---------------------------------------------------------------------------

/** The fields of a native reading the gate reads (see MyazaRectDetector.nitro.ts). */
export interface CornerFields {
  found: boolean;
  topLeftX?: number;
  topLeftY?: number;
  topRightX?: number;
  topRightY?: number;
  bottomRightX?: number;
  bottomRightY?: number;
  bottomLeftX?: number;
  bottomLeftY?: number;
  frameWidth?: number;
  frameHeight?: number;
  /** Set by the worklet wrapper when there is no detector to ask. */
  unavailable?: boolean;
}

export type CornerReading =
  | { kind: 'unavailable' }
  | { kind: 'measured'; quad: DocumentQuad | null; frameAspect: number | null };

const finite = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function readCorners(r: CornerFields | null | undefined): CornerReading {
  if (!r || r.unavailable) return { kind: 'unavailable' };
  const xs = [r.topLeftX, r.topLeftY, r.topRightX, r.topRightY, r.bottomRightX, r.bottomRightY, r.bottomLeftX, r.bottomLeftY];
  // An older native binary has no corner fields at all.
  if (!xs.every(finite)) return { kind: 'unavailable' };
  const fw = r.frameWidth;
  const fh = r.frameHeight;
  const frameAspect = finite(fw) && finite(fh) && fw > 0 && fh > 0 ? fw / fh : null;
  if (!r.found) return { kind: 'measured', quad: null, frameAspect };
  return {
    kind: 'measured',
    frameAspect,
    quad: {
      topLeft: { x: r.topLeftX as number, y: r.topLeftY as number },
      topRight: { x: r.topRightX as number, y: r.topRightY as number },
      bottomRight: { x: r.bottomRightX as number, y: r.bottomRightY as number },
      bottomLeft: { x: r.bottomLeftX as number, y: r.bottomLeftY as number },
    },
  };
}

/** A measured reading judged against the part of the frame the preview shows. */
export function judgeCorners(
  reading: Extract<CornerReading, { kind: 'measured' }>,
  viewAr: number,
  /** The drawn guide as shares of the preview box, when it should bound the size. */
  guide?: { x: number; y: number; width: number; height: number },
): CornersProblem | null {
  // A frame turned the other way from the preview was measured in a space the
  // user is not looking at: its corners land somewhere else on screen, so a
  // corner off the screen could read as in view. On Android the frame stream
  // used to follow the accelerometer while the preview follows the screen
  // (CameraViewfinder now pins it to the screen); this holds capture should
  // they ever disagree again. iOS always reports a portrait frame.
  if (reading.frameAspect && viewAr > 0 && reading.frameAspect !== 1 && viewAr !== 1 && reading.frameAspect > 1 !== viewAr > 1) {
    return 'no_document';
  }
  const visible = reading.frameAspect
    ? coverVisibleRegion(reading.frameAspect, viewAr)
    : { left: 0, top: 0, right: 1, bottom: 1 };
  const problem = cornersProblem(reading.quad, visible);
  if (problem || !guide || !reading.quad) return problem;
  // The guide in frame space: the preview shows `visible` of the frame.
  const vw = visible.right - visible.left;
  const vh = visible.bottom - visible.top;
  const inFrame = {
    left: visible.left + guide.x * vw,
    top: visible.top + guide.y * vh,
    right: visible.left + (guide.x + guide.width) * vw,
    bottom: visible.top + (guide.y + guide.height) * vh,
  };
  return exceedsGuide(reading.quad, inFrame) ? 'too_close' : null;
}

export function cornersHint(problem: CornersProblem): DocumentHint {
  switch (problem) {
    case 'no_document':
      return 'noDocument';
    case 'corner_cut_off':
      return 'cornerCutOff';
    case 'too_close':
      return 'tooClose';
  }
}
