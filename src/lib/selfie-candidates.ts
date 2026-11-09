// ---------------------------------------------------------------------------
// The best selfie seen so far in one liveness run (rules in selfie-pick.ts).
// Pure bookkeeping: the screen owns the camera.
//
// Every face frame of the gestures and the final capture is scored. A frame
// that could be the selfie (frontal, close enough, eyes open) and beats the
// best frame so far asks for a still: the native detectors hand JS angles,
// not pixels, so the web's "keep the analysed frame" becomes "take a silent
// still now". Stills are rationed (a gap between them, a cap per run), and a
// still is kept only if the face still qualified when it landed. A broken run
// (the continuity guard's verdict, or the face lost) clears it: the selfie
// must come from the same unbroken live run as the gestures. Mirrors the web
// SDK's lib/selfie-candidates.ts, plus two rules from the Flutter SDK: on
// iPhone pitch and roll are read from the person's own resting pose
// (SelfieAngleZero), and the face must have held still for a moment
// (SelfieSteadiness), or a frame from mid-movement can be kept smeared.
// ---------------------------------------------------------------------------

import {
  SelfieAngleZero,
  SelfieSteadiness,
  headPose,
  selfieFault,
  selfieScore,
  type SelfieFault,
  type StillFace,
} from './selfie-pick';
import type { LivenessFaceData } from '../liveness/types';

/** Why a frame was or was not the best so far, so the capture can say what to fix. */
export type SelfieVerdict = 'kept' | 'worse' | SelfieFault | 'moving';

/** A still taken during the run, with where the face sat in it. */
export interface HeldSelfie {
  uri: string;
  score: number;
  /** Null when the detector gave no centre: the still is used uncut. */
  face: StillFace | null;
}

/** A still being taken: which run it belongs to, and the frame's score. */
export interface SelfieShot {
  generation: number;
  score: number;
}

/** At most this many stills during one run's gestures. */
export const MAX_RUN_SHOTS = 4;
/** At least this long between two stills. */
export const RUN_SHOT_GAP_MS = 1000;
/** A still is only worth taking for a frame this much better than the held one. */
const BETTER_BY = 0.05;

export class SelfieCandidates {
  private bestFrame = 0;
  private held: HeldSelfie | null = null;
  private generation = 0;
  private inFlight = false;
  private shots = 0;
  private lastShot = -Infinity;
  private lastVerdict: SelfieVerdict | null = null;
  private readonly angleZero: SelfieAngleZero;
  private readonly steadiness = new SelfieSteadiness();

  /** `poseZeroFromRun`: pitch and roll from the run's resting pose (iPhone). */
  constructor(options: { poseZeroFromRun?: boolean } = {}) {
    this.angleZero = new SelfieAngleZero(options.poseZeroFromRun ?? false);
  }

  /** The best selfie so far, or null. */
  get best(): HeldSelfie | null {
    return this.held;
  }

  /** The verdict on the latest frame. */
  get latest(): SelfieVerdict | null {
    return this.lastVerdict;
  }

  /** A broken run: nothing held so far may become the selfie. */
  clear(): void {
    this.generation += 1;
    this.held = null;
    this.bestFrame = 0;
    this.inFlight = false;
    this.lastVerdict = null;
    this.angleZero.clear();
    this.steadiness.clear();
  }

  /** A fresh session (a retry): the still ration starts again too. */
  reset(): void {
    this.clear();
    this.shots = 0;
    this.lastShot = -Infinity;
  }

  /**
   * Every face the detector reports, in any phase, so the resting pose
   * (iPhone) follows the run and the next frame scored knows whether the face
   * has held still. Call before `consider` for the same frame.
   */
  observe(face: LivenessFaceData, now: number): void {
    this.angleZero.add(face);
    this.steadiness.add(face, now);
  }

  /** Score one frame (the one last observed: steadiness is the run's). */
  consider(face: LivenessFaceData): { verdict: SelfieVerdict; score: number } {
    const zero = this.angleZero.zero;
    const fault: SelfieVerdict | null = selfieFault(face, zero) ?? (this.steadiness.steady ? null : 'moving');
    if (fault) {
      this.lastVerdict = fault;
      return { verdict: fault, score: 0 };
    }
    const score = selfieScore(headPose(face, zero));
    const verdict: SelfieVerdict = score > this.bestFrame ? 'kept' : 'worse';
    if (verdict === 'kept') this.bestFrame = score;
    this.lastVerdict = verdict;
    return { verdict, score };
  }

  /**
   * Whether to take a still for a frame just scored: it was the best so far,
   * better than the still held by a margin, and the ration allows one now.
   * Starts the shot when it says yes.
   */
  shoot(verdict: SelfieVerdict, score: number, now: number): SelfieShot | null {
    if (verdict !== 'kept' || this.inFlight) return null;
    if (this.shots >= MAX_RUN_SHOTS || now - this.lastShot < RUN_SHOT_GAP_MS) return null;
    if (this.held && score < this.held.score + BETTER_BY) return null;
    this.inFlight = true;
    this.shots += 1;
    this.lastShot = now;
    return { generation: this.generation, score };
  }

  /**
   * A still landed (or failed: `uri` null). Kept when it belongs to this run,
   * the face still qualified when it landed, and it beats the one held.
   */
  land(shot: SelfieShot, uri: string | null, face: StillFace | null): boolean {
    if (shot.generation !== this.generation) return false;
    this.inFlight = false;
    if (!uri) return false;
    if (this.lastVerdict !== 'kept' && this.lastVerdict !== 'worse') return false;
    if (this.held && this.held.score >= shot.score) return false;
    this.held = { uri, score: shot.score, face };
    return true;
  }
}
