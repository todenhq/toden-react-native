// ---------------------------------------------------------------------------
// The final capture's shutter (the web SDK's `capturing` branch of
// useLiveness, user decision 2026-11-07). Pure.
//
// A frame counts toward the shutter only if it could be the selfie: placed
// in the window, facing the camera, eyes open, close enough for the standard
// frame, the face held still (lib/selfie-pick.ts). Held like that for
// CAPTURE_HOLD_MS and the live still is taken. Short of that, the guidance
// says what to fix: "look straight", "move closer", "hold still". After
// CAPTURE_WAIT_MS the run's best still stands in, rather than holding the
// person on the step. The face gone for FACE_GONE_MS breaks the run: the
// selfie must come from the same live run as the gestures.
//
// The hold is timed, not counted (the detector drops frames while busy, so a
// count meant a different length on every phone), and one stray frame does
// not restart it: the detector's angles jitter, and a face sitting still near
// the frontal band's edge used to lose three frames of credit for every one
// that strayed, so on an iPhone it never held at all (user report
// 2026-11-09). Two in a row do restart it, and the still is only ever taken
// on a frame that qualified.
//
// One addition over web, for the native detectors: when the run held no still
// and no frame has qualified after CAPTURE_GIVE_UP_MS, a placed face is taken
// anyway. A device whose reading sits outside the frontal band must not leave
// the person on the step for ever. The continuity guard still covers that
// frame.
// ---------------------------------------------------------------------------

import type { SelfieVerdict } from './selfie-candidates';

/** Qualifying frames for this long take the live still (Flutter's 500ms). */
export const CAPTURE_HOLD_MS = 500;
/** Frames in a row that may stray without restarting the hold. */
export const CAPTURE_STRAY_FRAMES = 1;
/** After this long on the final capture, the run's best still is used. */
export const CAPTURE_WAIT_MS = 3000;
/** With no still from the run and no frame qualifying, a placed face is taken. */
export const CAPTURE_GIVE_UP_MS = 8000;
/** No face for this long on the final capture fails the run (`face_lost`). */
export const FACE_GONE_MS = 1000;

/** What to tell the person while the shutter waits. */
export type CaptureGuidance = 'position' | 'lookStraight' | 'moveCloser' | 'holdStill';

export type CaptureDecision =
  | { fire: 'live' | 'best' }
  | { fire: null; guidance: CaptureGuidance | null };

export class SelfieCaptureGate {
  private since = 0;
  /** When the current hold began; 0 for none. */
  private holdSince = 0;
  private strays = 0;
  private fired = false;

  /** Leaving the capture (a reset, a restart): the next one starts afresh. */
  reset(): void {
    this.since = 0;
    this.holdSince = 0;
    this.strays = 0;
    this.fired = false;
  }

  get hasFired(): boolean {
    return this.fired;
  }

  /** One face frame on the final capture. */
  frame(input: { verdict: SelfieVerdict | null; placed: boolean; hasBest: boolean; now: number }): CaptureDecision {
    if (this.fired) return { fire: null, guidance: null };
    if (!this.since) this.since = input.now;
    const waited = input.now - this.since;
    if (input.hasBest && waited > CAPTURE_WAIT_MS) {
      this.fired = true;
      return { fire: 'best' };
    }
    const usable = input.placed && (input.verdict === 'kept' || input.verdict === 'worse');
    if (usable) {
      this.strays = 0;
      if (!this.holdSince) this.holdSince = input.now;
      if (input.now - this.holdSince >= CAPTURE_HOLD_MS) {
        this.fired = true;
        return { fire: 'live' };
      }
      return { fire: null, guidance: null };
    }
    if (input.placed && !input.hasBest && waited > CAPTURE_GIVE_UP_MS) {
      this.fired = true;
      return { fire: 'live' };
    }
    // One stray frame inside a hold: the hold stands, and the guidance too.
    if (this.holdSince && this.strays < CAPTURE_STRAY_FRAMES) {
      this.strays += 1;
      return { fire: null, guidance: null };
    }
    this.holdSince = 0;
    this.strays = 0;
    const guidance: CaptureGuidance = !input.placed
      ? 'position'
      : input.verdict === 'turned'
        ? 'lookStraight'
        : input.verdict === 'far'
          ? 'moveCloser'
          : 'holdStill';
    return { fire: null, guidance };
  }

  /** A frame with no face. True when the run is broken (`face_lost`). */
  noFace(lastSeen: number | null, now: number): boolean {
    if (this.fired) return false;
    if (!this.since) {
      this.since = now;
      return false;
    }
    return now - Math.max(lastSeen ?? 0, this.since) > FACE_GONE_MS;
  }
}
