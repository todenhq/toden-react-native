import type { useFrameOutput } from 'react-native-vision-camera';

import type { MrzScan } from '../mrz/parse';
import type { DocumentGuidance, DocumentHint } from './documentIdentity';
import type { CornerFraming } from './useCornerGate';

// The options and result of useAutoCapture, split out for the 200-line rule.

export interface AutoCaptureOptions {
  /** Off while capturing/uploading, on a preview, or when there is no camera. */
  enabled: boolean;
  country: string;
  idType: string;
  /**
   * Which face is up. The back of a card carries none of the front's identity
   * keywords (a PVC back is barcode and small print), so the gate must not
   * demand them there — the front capture moments earlier established what
   * document this is.
   */
  side?: 'front' | 'back';
  /** The chip step wants the MRZ, so hold out for a check-digit-valid read. */
  requireMrz?: boolean;
  /** An MRZ is already stored from an earlier frame or a previous side. */
  mrzAlreadyCaptured?: boolean;
  /** Called once per fresh MRZ read — bank it for the chip step. */
  onMrz?: (scan: MrzScan) => void;
  /** Called once when the gate decides to shoot. */
  onFire: () => void;
  /** Expected width ÷ height, for the geometry check where it is available. */
  guideAspect?: number;
  /**
   * Changing this starts a fresh dwell.
   *
   * Load-bearing for two-sided documents: the front and the back are the same
   * `idType`, and the viewfinder does not remount between them — so without a
   * key that actually changes, the gate stays LATCHED from the front and the
   * back never auto-captures. Pass the side (or anything else that identifies
   * "this is a new thing to look at").
   */
  resetKey?: string;
  /**
   * Width ÷ height of the box the preview is drawn in. The corner gate judges
   * the corners against the part of the frame that box shows (cover-fit), so a
   * corner the user cannot see counts as cut off.
   */
  viewAr: number;
  /** The camera is live; a detector silent this long after is treated as absent. */
  cameraActive: boolean;
  /**
   * The document is framed upright on a phone held upright (a NIN slip, see
   * documentTurn.ts), so its text is read a quarter turn round.
   */
  turned?: boolean;
  /**
   * The drawn guide as shares of the preview box. Given while turned: a slip
   * found much larger than it is held too close (documentCorners exceedsGuide).
   */
  guide?: { x: number; y: number; width: number; height: number };
}

export interface AutoCaptureState {
  /** Attach to `<Camera outputs={[...]}>`. */
  frameOutput: ReturnType<typeof useFrameOutput>;
  guidance: DocumentGuidance;
  /** 0..1 through the stability dwell — drives the scan ring. */
  progress: number;
  /** Whether a check-digit-valid MRZ has been read this session. */
  hasMrz: boolean;
  /** Start a fresh dwell (new side, or a retake). */
  reset: () => void;
  /** The four-corner gate's hint while it holds capture, else null. */
  cornerHint: DocumentHint | null;
  /** Whether the four-corner gate holds the MANUAL shutter right now. */
  shutterBlocked: () => boolean;
  /** The corners that last passed, for cropping the photo with space around them. */
  cornerFraming: () => CornerFraming | null;
  /**
   * When turned: the extra clockwise quarter turns (1 or 3) that last read the
   * document, so the capture can be turned back the right way. Null when not
   * turned or not yet read.
   */
  readTurn: () => number | null;
}
