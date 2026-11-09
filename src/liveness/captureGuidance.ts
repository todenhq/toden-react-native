// ---------------------------------------------------------------------------
// Where the face sits, and what to say, on the final capture. Split from
// useLiveness (200-line rule). The placement is the rule the challenges use
// (useLiveness checkPosition): inside the full-screen window, else a sensible
// size in the frame.
// ---------------------------------------------------------------------------

import { faceWindowGuidance, type FaceWindow } from '../lib/faceWindow';
import type { CaptureGuidance } from '../lib/selfie-capture-gate';
import type { TextFn } from '../i18n/types';
import { defaultText } from '../i18n/translate';
import { FACE_TOO_CLOSE_RATIO, FACE_TOO_FAR_RATIO, type LivenessFaceData } from './types';
import {
  POSITION_TOO_CLOSE,
  POSITION_TOO_FAR,
  positionGuidanceText,
  type PositionGuidance,
} from './livenessState';

/** PURE. What is wrong with where the face sits, or null when it is placed. */
export function facePlacement(
  data: LivenessFaceData,
  window: FaceWindow | null,
  moving = false,
): PositionGuidance | null {
  const ratio = data.faceSizeRatio;
  if (window) {
    return faceWindowGuidance(window, { width: ratio, centreX: data.faceCenterX, centreY: data.faceCenterY, moving });
  }
  if (ratio < FACE_TOO_FAR_RATIO) return POSITION_TOO_FAR;
  if (ratio > FACE_TOO_CLOSE_RATIO) return POSITION_TOO_CLOSE;
  return null;
}

/** The capture's own hold line, as before the selfie was chosen. */
export const CAPTURE_HOLD_STILL = 'Hold still…';

/** PURE. The instruction for the capture's guidance; null leaves it as it is. */
export function captureGuidanceText(
  guidance: CaptureGuidance | null,
  data: LivenessFaceData,
  window: FaceWindow | null,
  t: TextFn = defaultText,
): string | null {
  switch (guidance) {
    case 'position': {
      const placement = facePlacement(data, window);
      return placement ? positionGuidanceText(placement) : null;
    }
    case 'lookStraight':
      return t('presence.position.lookStraight');
    case 'moveCloser':
      return t('presence.position.moveCloser');
    case 'holdStill':
      return CAPTURE_HOLD_STILL;
    default:
      return null;
  }
}
