import { useCallback, useEffect, useRef, useState } from 'react';

import { cornersHint, judgeCorners, readCorners, type CornerFields } from './cornerGate';
import type { DocumentQuad } from './documentCorners';
import type { DocumentHint } from './documentIdentity';

// ---------------------------------------------------------------------------
// The four-corner gate's state: whether the latest frame showed all four
// corners of the document with space past each, and which corners those were.
//
// It holds BOTH capture routes. Auto-capture waits for it, and the manual
// shutter is disabled until it passes, because a passport photographed with
// its machine-readable zone off the edge cannot be read whichever button took
// it. The passing corners are also what the saved photo is cropped to.
//
// Steps aside (today's behaviour) when there is no detector: none in the build,
// one that throws, an older native binary that reports no corners, or a camera
// that never delivers a frame to read.
// ---------------------------------------------------------------------------

/** No reading at all this long after the camera went live means no detector. */
const FIRST_READING_TIMEOUT_MS = 3000;

type Detector = 'unknown' | 'available' | 'unavailable';

/** The document as it last passed the gate, in the camera frame's coordinates. */
export interface CornerFraming {
  quad: DocumentQuad;
  /** Upright frame width ÷ height, when the detector reported it. */
  frameAspect: number | null;
}

export interface CornerGate {
  /** Judge a reading. Returns the hint to show, or null when capture may go ahead. */
  observe: (reading: CornerFields, viewAr: number, guide?: { x: number; y: number; width: number; height: number }) => DocumentHint | null;
  /** The live hint while the gate holds capture; null when it does not. */
  hint: DocumentHint | null;
  /** Read at press time, so a stale render cannot let a capture through. */
  isBlocked: () => boolean;
  /** The passing corners, or null when there are none (or no detector). */
  latest: () => CornerFraming | null;
}

export function useCornerGate(cameraActive: boolean, detectorPresent: boolean): CornerGate {
  const [detector, setDetector] = useState<Detector>(detectorPresent ? 'unknown' : 'unavailable');
  const [hint, setHint] = useState<DocumentHint | null>(detectorPresent ? 'noDocument' : null);
  const detectorRef = useRef(detector);
  detectorRef.current = detector;
  const hintRef = useRef(hint);
  hintRef.current = hint;
  const framingRef = useRef<CornerFraming | null>(null);

  const showHint = useCallback((next: DocumentHint | null) => {
    hintRef.current = next;
    setHint((prev) => (prev === next ? prev : next));
  }, []);
  const markDetector = useCallback((next: Detector) => {
    detectorRef.current = next;
    setDetector((prev) => (prev === next ? prev : next));
  }, []);

  // A camera that never delivers a reading must not hold the shutter forever.
  useEffect(() => {
    if (!cameraActive || detector !== 'unknown') return undefined;
    const t = setTimeout(() => {
      if (detectorRef.current === 'unknown') {
        markDetector('unavailable');
        showHint(null);
      }
    }, FIRST_READING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [cameraActive, detector, markDetector, showHint]);

  const observe = useCallback(
    (reading: CornerFields, viewAr: number, guide?: { x: number; y: number; width: number; height: number }): DocumentHint | null => {
      const r = readCorners(reading);
      if (r.kind === 'unavailable') {
        // Only before the detector has ever answered: one failed frame from a
        // working detector is not a reason to drop the gate.
        if (detectorRef.current === 'unknown') {
          markDetector('unavailable');
          showHint(null);
        }
        if (detectorRef.current === 'unavailable') return null;
        return hintRef.current;
      }
      markDetector('available');
      const problem = judgeCorners(r, viewAr, guide);
      if (problem || !r.quad) {
        framingRef.current = null;
        const next = cornersHint(problem ?? 'no_document');
        showHint(next);
        return next;
      }
      framingRef.current = { quad: r.quad, frameAspect: r.frameAspect };
      showHint(null);
      return null;
    },
    [markDetector, showHint],
  );

  const isBlocked = useCallback(
    () => detectorRef.current !== 'unavailable' && framingRef.current === null,
    [],
  );
  const latest = useCallback(() => framingRef.current, []);

  return { observe, hint: detector === 'unavailable' ? null : hint, isBlocked, latest };
}
