import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrameOutput } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-worklets';

import { hasTextRecognizer, primeTextModel, recognizeAllLines, recognizeTurnedLines } from '../mrz/textRecognizer';
import { extractMrz } from '../mrz/extract';
import { DocumentTextGate } from './documentTextGate';
import { readProvesTurn } from './documentTurn';
import { documentCarriesMrz, type DocumentGuidance } from './documentIdentity';
import { detectRectOnFrame, hasRectDetector, setRectDetectorUpright, type RectReading } from './rectDetector';
import { rectFramingProblem } from './rectGate';
import { stillSameFace, wordsOf } from './sameFace';
import { useCornerGate } from './useCornerGate';
import type { AutoCaptureOptions, AutoCaptureState } from './autoCaptureTypes';

export type { AutoCaptureOptions, AutoCaptureState } from './autoCaptureTypes';

// ---------------------------------------------------------------------------
// Auto-capture: shoot when the document is identified, framed and still.
//
// Detection is an ACCELERATOR, never the only route — the manual shutter stays
// live, and a build without the native recogniser simply never fires this. The
// one thing both routes wait for is the four-corner gate (useCornerGate): a
// document is captured only with all four corners in view and space past them.
//
// Reading text per frame also banks the MRZ ahead of the shutter, so the chip
// step needs no second scan of the same passport. That is the main reason the
// gate reads text rather than just measuring edges.
// ---------------------------------------------------------------------------

/** How often a frame is actually recognised. OCR is far slower than 30fps. */
const DETECT_INTERVAL_MS = 250;

/** A turned read that stops finding the document lets go of its direction after this. */
const TURN_RELEASE_MS = 2000;

const INITIAL: DocumentGuidance = { framing: 'none', hint: 'searching' };

export function useAutoCapture({
  enabled,
  country,
  idType,
  side = 'front',
  requireMrz = false,
  mrzAlreadyCaptured = false,
  onMrz,
  onFire,
  guideAspect = 1.586,
  resetKey,
  viewAr,
  cameraActive,
  turned = false,
  guide,
}: AutoCaptureOptions): AutoCaptureState {
  // RESOLVE FIRST, synchronously, before `useFrameOutput` below builds the
  // worklet. Both modules hand the worklet a BOXED handle that only the JS
  // thread can create, and the worklet captures that handle when it is CREATED
  // — so a handle still unresolved at that moment is null on the camera thread
  // forever, and every frame reports "no text, no rectangle".
  //
  // Module-import time is too early (Nitro's registry may not be populated) and
  // a useEffect is too late (it runs after the worklet exists). The component
  // body is the one place that is both.
  hasTextRecognizer();
  const rectPresent = hasRectDetector();
  // Android fetches the text model through Play Services, so start it here too.
  // The flow primes at open and this is normally a no-op, but the document step
  // can be reached directly in a resumed session. Auto-capture deliberately does
  // NOT gate on readiness: it is an accelerator, the manual shutter is live
  // throughout, so a model that never arrives costs convenience rather than
  // leaving the user stuck.
  primeTextModel();

  const gate = useMemo(() => new DocumentTextGate(), []);
  const corners = useCornerGate(cameraActive, rectPresent);
  // Stable across renders, so the frame callback below is created once.
  const observeCorners = corners.observe;
  const [guidance, setGuidance] = useState<DocumentGuidance>(INITIAL);
  const [progress, setProgress] = useState(0);
  const [hasMrz, setHasMrz] = useState(false);

  const lastDetectRef = useRef(0);
  // What the front said, kept across the side change so the back can be told
  // from it. A frame with little on it does not replace a good reading.
  const frontWordsRef = useRef<Set<string> | null>(null);
  const firedRef = useRef(false);
  // Turned reads: the direction that read the document is kept (a miss resets
  // the gate's hold, so alternating would never let it fire), and let go after
  // TURN_RELEASE_MS without a read, in case the slip was turned the other way.
  const [lockedTurn, setLockedTurn] = useState(0);
  const readTurnRef = useRef<number | null>(null);
  const lastReadAtRef = useRef(0);
  // Refs, not deps: the worklet callback is created once, and re-creating it on
  // every guidance change would tear down the frame output mid-stream.
  const opts = { enabled, country, idType, side, requireMrz, mrzAlreadyCaptured, onMrz, onFire, guideAspect, viewAr, guide };
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Deliberately does NOT clear `hasMrz`: the MRZ belongs to the document, not
  // to the side being photographed, and clearing it would make the chip step
  // ask for a strip that has already been read.
  const reset = useCallback(() => {
    gate.reset();
    firedRef.current = false;
    lastDetectRef.current = 0;
    readTurnRef.current = null;
    setLockedTurn(0);
    setGuidance(INITIAL);
    setProgress(0);
  }, [gate]);

  // A new side is a new document face: the previous side's dwell and verdict
  // must not carry over, or the back would fire on the front's decision — and
  // worse, the gate's `fired` latch would mean it never fires at all.
  // `idType` alone is NOT enough: both sides of a card share it.
  useEffect(() => {
    reset();
  }, [idType, resetKey, reset]);

  useEffect(() => {
    frontWordsRef.current = null;
  }, [idType]);

  // Android's edge search looks for one orientation at a time: an upright slip
  // is never found by the landscape search, so auto-capture never fired.
  useEffect(() => {
    setRectDetectorUpright(turned);
    return () => setRectDetectorUpright(false);
  }, [turned]);

  const handleFrame = useCallback((lines: string[], rect: RectReading, quarterTurns: number) => {
    const o = optsRef.current;
    const now = Date.now();
    if (now - lastDetectRef.current < DETECT_INTERVAL_MS) return;
    lastDetectRef.current = now;

    if (o.side === 'front') {
      const words = wordsOf(lines);
      if (words.size >= (frontWordsRef.current?.size ?? 0) * 0.7) frontWordsRef.current = words;
    }

    // The corner gate is judged even while auto-capture is off: it also holds
    // the MANUAL shutter, which has to know whether the corners are in view.
    const cornerHint = observeCorners(rect, o.viewAr, o.guide);
    if (!o.enabled || firedRef.current) return;

    // Bank the MRZ whenever one validates — this is what spares the user
    // scanning the same passport again at the chip step.
    let freshMrz = false;
    const scan = extractMrz(lines);
    if (scan) {
      freshMrz = true;
      setHasMrz(true);
      o.onMrz?.(scan);
    }

    // CORNERS first: all four in view, with space past each, before anything
    // else is worth judging. A passport whose MRZ runs off the edge stops here.
    if (cornerHint) {
      setGuidance({ framing: 'adjust', hint: cornerHint });
      setProgress(0);
      return;
    }

    // GEOMETRY next, where the platform has it. A shape complaint is
    // actionable on its own ("move back"), and letting it through would mean
    // running out a stability dwell on a document whose corners are cut off.
    // Absent a detector this is null and the text gate decides alone.
    const shapeProblem = rectFramingProblem(rect, { expectedAspect: o.guideAspect });
    if (shapeProblem) {
      setGuidance({ framing: 'adjust', hint: shapeProblem });
      setProgress(0);
      return;
    }

    // Asked for the back and still shown the front: say so rather than shoot it.
    if (o.side === 'back' && stillSameFace(frontWordsRef.current, lines)) {
      gate.reset();
      setGuidance({ framing: 'adjust', hint: 'showBack' });
      setProgress(0);
      return;
    }

    const verdict = gate.update(lines, {
      country: o.country,
      idType: o.idType,
      side: o.side,
      // The MRZ is a FRONT-side key; the back of a card has no strip to wait for.
      requireMrz: o.side !== 'back' && (o.requireMrz || documentCarriesMrz(o.idType)),
      hasValidMrz: freshMrz,
      mrzAlreadyCaptured: o.mrzAlreadyCaptured,
      now,
    });
    setGuidance(verdict);
    setProgress(gate.progress(now));
    if (quarterTurns === 1 || quarterTurns === 3) {
      if ((verdict.framing === 'holding' || verdict.framing === 'ready') && readProvesTurn(lines, o.country, o.idType)) {
        readTurnRef.current = quarterTurns;
        lastReadAtRef.current = now;
        setLockedTurn(quarterTurns);
      } else if (now - lastReadAtRef.current > TURN_RELEASE_MS) {
        setLockedTurn(0);
      }
    }

    if (verdict.framing === 'ready' && !firedRef.current) {
      firedRef.current = true;
      o.onFire();
    }
  }, [gate, observeCorners]);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    // Recognition runs far longer than a frame interval, so skip whatever
    // arrives mid-pass rather than queueing it late.
    dropFramesWhileBusy: true,
    onFrame: (frame) => {
      'worklet';
      const read = turned ? recognizeTurnedLines(frame, lockedTurn) : { lines: recognizeAllLines(frame), quarterTurns: 0 };
      const rect = detectRectOnFrame(frame);
      frame.dispose();
      runOnJS(handleFrame)(read.lines, rect, read.quarterTurns);
    },
    onFrameDropped: () => {
      'worklet';
    },
  });

  return {
    frameOutput, guidance, progress, hasMrz, reset,
    cornerHint: corners.hint,
    shutterBlocked: corners.isBlocked,
    cornerFraming: corners.latest,
    readTurn: () => (turned ? readTurnRef.current : null),
  };
}
