// ---------------------------------------------------------------------------
// The selfie, chosen rather than snapped (user decision 2026-11-07). Pure.
//
// The still used to be whatever the camera saw a moment after the last
// gesture. Centred is not facing the camera: after "turn your head" a person
// can still be turned with their nose mid-frame, and the selfie came out
// side-on. A separate "look at the camera" step would be a seam an attacker
// could use (pass the gestures live, then hold up a photo), so there is none:
// frames are scored all through the live check, the best front-on one is
// kept, and the final shot comes from the same unbroken run.
//
// Every selfie is cut to one standard frame: 3:4, head and shoulders, the face
// a set share of the width. Never enlarged.
//
// Mirrors the web SDK's lib/selfie-pick.ts. The web reads the head's pose
// from MediaPipe landmarks (a turn in inter-eye distances); this SDK has the
// native detectors' head angles in DEGREES (Apple Vision / ML Kit, the same
// signals the gestures read), so the frontal limits are angles here.
// ---------------------------------------------------------------------------

import type { LivenessFaceData } from '../liveness/types';
import { FACE_TOO_FAR_RATIO } from '../liveness/types';

/** The face's share of the selfie's width. */
export const SELFIE_FACE_SHARE = 0.42;
/** Width over height of the selfie: 3:4 portrait. */
export const SELFIE_ASPECT = 3 / 4;
/** The face's centre sits this far down the frame, leaving room for the head. */
export const SELFIE_FACE_CENTRE_Y = 0.46;
/** The selfie's width at most: enough for the face match, small to upload. */
export const SELFIE_MAX_WIDTH = 720;
/** Narrower than this in camera pixels, the face is too far away to keep. */
export const SELFIE_MIN_WIDTH = 360;

/** Head turn, nod and tilt from the native detector, in degrees. */
export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

/**
 * Frontal limits, in degrees. The web SDK allows a turn of 0.12 inter-eye
 * distances, which is about 10° of yaw; nod and tilt take the same 10°.
 */
export const MAX_YAW_DEG = 10;
export const MAX_PITCH_DEG = 10;
export const MAX_ROLL_DEG = 10;
/** Both eyes' mean open probability at least this (0 closed, 1 open). */
export const MIN_EYES_OPEN = 0.5;

/** Where pitch and roll read zero (see SelfieAngleZero). */
export interface PoseZero {
  pitch: number;
  roll: number;
}

/** PURE. The smallest signed difference between two angles in degrees. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * PURE. The head's pose as the native detector reports it, pitch and roll
 * measured from `zero` (the person's own resting pose on iPhone).
 */
export function headPose(face: LivenessFaceData, zero: PoseZero = { pitch: 0, roll: 0 }): HeadPose {
  return {
    yaw: face.headEulerAngleY,
    pitch: face.headEulerAngleX - zero.pitch,
    roll: angleDelta(face.headEulerAngleZ, zero.roll),
  };
}

/** PURE. Facing the camera: no turn, nod or tilt beyond a small allowance. */
export function isFrontal(pose: HeadPose | null): boolean {
  return (
    !!pose &&
    Math.abs(pose.yaw) <= MAX_YAW_DEG &&
    Math.abs(pose.pitch) <= MAX_PITCH_DEG &&
    Math.abs(pose.roll) <= MAX_ROLL_DEG
  );
}

/** PURE. Both eyes open enough for a selfie worth keeping. */
export function eyesOpen(face: LivenessFaceData): boolean {
  return (face.leftEyeOpenProbability + face.rightEyeOpenProbability) / 2 >= MIN_EYES_OPEN;
}

/** Why a frame could or could not be the selfie. Null: it could. */
export type SelfieFault = 'turned' | 'far' | 'eyes';

/**
 * PURE. Whether this frame could be the selfie: facing the camera, close
 * enough for the standard frame, eyes open (checked in that order, the
 * web's order, so the guidance names the first thing to fix).
 */
export function selfieFault(face: LivenessFaceData, zero?: PoseZero): SelfieFault | null {
  if (!isFrontal(headPose(face, zero))) return 'turned';
  if (face.faceSizeRatio < FACE_TOO_FAR_RATIO) return 'far';
  if (!eyesOpen(face)) return 'eyes';
  return null;
}

/**
 * PURE. How good a candidate is: more squarely facing the camera wins. The
 * pose terms are each 0..1 (1 = straight on). `sharpness`, a Laplacian
 * variance as on web, is optional: per-frame pixels never reach JS here, so
 * the run's candidates are ranked by straightness alone.
 */
export function selfieScore(pose: HeadPose, sharpness?: number): number {
  const straight =
    (1 - Math.min(1, Math.abs(pose.yaw) / MAX_YAW_DEG)) +
    (1 - Math.min(1, Math.abs(pose.pitch) / MAX_PITCH_DEG)) +
    (1 - Math.min(1, Math.abs(pose.roll) / MAX_ROLL_DEG));
  return straight / 3 + (sharpness == null ? 0 : Math.min(1, sharpness / 120));
}

/**
 * Where pitch and roll read zero (user report 2026-11-09: an iPhone 16 Pro
 * Max sat on "look straight at the camera" until the long wait ran out).
 *
 * Android's ML Kit reports both against a true zero. On iPhone neither has
 * one to rely on: Vision's pitch is often the landmark estimate in
 * HybridMyazaFaceDetector.swift (a fixed eye-to-nose gap that is no one's
 * neutral), and a phone held a little below the face, as most are, reads as
 * a nod however straight the person looks. Against an absolute zero with a
 * 10° allowance, that face hovered on the band's edge and never held. There
 * the zero is the run's own resting pose: the median of the recent frames, so
 * the gestures (a nod is symmetrical about rest) do not move it. Yaw keeps
 * its true zero on both: the turn is what a side-on selfie gets wrong.
 * Mirrors the Flutter SDK's SelfieAngleZero.
 */
export class SelfieAngleZero {
  /** Frames the median is taken over (about three seconds at 15fps). */
  static readonly WINDOW = 45;

  private pitches: number[] = [];
  private rolls: number[] = [];

  constructor(private readonly fromRun: boolean) {}

  clear(): void {
    this.pitches = [];
    this.rolls = [];
  }

  add(face: LivenessFaceData): void {
    if (!this.fromRun) return;
    this.pitches.push(face.headEulerAngleX);
    this.rolls.push(face.headEulerAngleZ);
    if (this.pitches.length > SelfieAngleZero.WINDOW) this.pitches.shift();
    if (this.rolls.length > SelfieAngleZero.WINDOW) this.rolls.shift();
  }

  get zero(): PoseZero {
    return this.fromRun ? { pitch: median(this.pitches), roll: median(this.rolls) } : { pitch: 0, roll: 0 };
  }
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The face held this long without moving before its frame may be the selfie. */
export const SELFIE_STEADY_MS = 300;
/**
 * Steady: the face's centre moved at most this share of its own width over
 * SELFIE_STEADY_MS. Against the face, not the frame, as the selfie is cut to
 * the face: 0.1 of it is about 3px of smear in the 720px selfie.
 */
export const SELFIE_STEADY_SHIFT = 0.1;
/** Steady: the face's width changed by at most this share (no lunge). */
export const SELFIE_STEADY_SCALE = 0.1;
/** Steady: the head turned by at most this many degrees. Generous, yaw is noisy. */
export const SELFIE_STEADY_TURN_DEG = 8;

/**
 * Whether the face has held still. Pose alone cannot see a swing: the phone
 * coming up passes through a straight face, smeared. Movement is what smears
 * a frame, so it is asked directly: every face is fed in, and the latest
 * counts as steady once the face has stayed put for SELFIE_STEADY_MS. One
 * stray reading in the window is forgiven (a detector's box jumps on a single
 * frame now and then; a real movement moves every frame after it). The first
 * frames of a run are never steady: there is nothing yet to compare with.
 * Mirrors the Flutter SDK's SelfieSteadiness.
 */
export class SelfieSteadiness {
  private seen: { at: number; face: LivenessFaceData }[] = [];

  clear(): void {
    this.seen = [];
  }

  add(face: LivenessFaceData, at: number): void {
    this.seen.push({ at, face });
    // Keep the window plus the one face just before it, which proves the
    // window is covered.
    const from = at - SELFIE_STEADY_MS;
    while (this.seen.length > 1 && this.seen[1]!.at <= from) this.seen.shift();
  }

  get steady(): boolean {
    const last = this.seen[this.seen.length - 1];
    if (!last || this.seen[0]!.at > last.at - SELFIE_STEADY_MS) return false;
    let moved = 0;
    for (const s of this.seen) if (faceMoved(s.face, last.face)) moved += 1;
    // The one stray reading is forgiven only among enough to outvote it.
    return moved <= (this.seen.length >= 4 ? 1 : 0);
  }
}

function faceMoved(a: LivenessFaceData, b: LivenessFaceData): boolean {
  const width = Math.max(b.faceSizeRatio, 1e-6);
  if (Math.abs(a.faceSizeRatio - b.faceSizeRatio) / width > SELFIE_STEADY_SCALE) return true;
  if (Math.abs(angleDelta(a.headEulerAngleY, b.headEulerAngleY)) > SELFIE_STEADY_TURN_DEG) return true;
  const { faceCenterX: ax, faceCenterY: ay } = a;
  const { faceCenterX: bx, faceCenterY: by } = b;
  // A detector that reports no centre is judged on size and turn alone.
  if (ax == null || ay == null || bx == null || by == null) return false;
  return Math.hypot(ax - bx, ay - by) / width > SELFIE_STEADY_SHIFT;
}

/** A rectangle in camera pixels. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * PURE. The standard selfie frame around a face, in camera pixels: 3:4, the
 * face SELFIE_FACE_SHARE of its width, the face's centre SELFIE_FACE_CENTRE_Y
 * down. Moved (never squeezed) to stay inside the camera frame; when the frame
 * is too small for it, the largest 3:4 frame that fits. Null when the face is
 * too far away for a selfie worth keeping. `face` is normalised (0..1).
 */
export function selfieFrame(
  face: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): PixelRect | null {
  const faceWidth = face.width * frameWidth;
  let width = faceWidth / SELFIE_FACE_SHARE;
  let height = width / SELFIE_ASPECT;
  if (height > frameHeight) {
    height = frameHeight;
    width = height * SELFIE_ASPECT;
  }
  if (width > frameWidth) {
    width = frameWidth;
    height = width / SELFIE_ASPECT;
  }
  if (width < SELFIE_MIN_WIDTH) return null;
  const cx = (face.x + face.width / 2) * frameWidth;
  const cy = (face.y + face.height / 2) * frameHeight;
  const clamp = (v: number, size: number, limit: number): number => Math.min(Math.max(0, v), limit - size);
  return {
    x: Math.round(clamp(cx - width / 2, width, frameWidth)),
    y: Math.round(clamp(cy - height * SELFIE_FACE_CENTRE_Y, height, frameHeight)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** PURE. The rectangle mirrored left to right. */
export function mirrorRect(rect: PixelRect, frameWidth: number): PixelRect {
  return { ...rect, x: frameWidth - rect.x - rect.width };
}

/** Where the face sits in the STORED still, normalised: centre and width share. */
export interface StillFace {
  centreX: number;
  centreY: number;
  width: number;
}

/**
 * PURE. The detector's face in the stored still's coordinates. The camera
 * mirrors its stills like its preview (`mirrorMode="on"`, as a mirror reads),
 * and the two detectors report in different spaces:
 *  - iOS (Vision on a `.leftMirrored` buffer): already mirrored, but Vision's
 *    origin is the BOTTOM left, so y is flipped;
 *  - Android (ML Kit on the upright sensor image): top-left origin, NOT
 *    mirrored, so x is flipped.
 * Null when the detector gave no centre. Needs a device to confirm each.
 */
export function stillFace(face: LivenessFaceData, os: string): StillFace | null {
  if (face.faceCenterX == null || face.faceCenterY == null) return null;
  const ios = os === 'ios';
  return {
    centreX: ios ? face.faceCenterX : 1 - face.faceCenterX,
    centreY: ios ? 1 - face.faceCenterY : face.faceCenterY,
    width: face.faceSizeRatio,
  };
}

/** PURE. The standard frame around a face placed in a still of this size. */
export function selfieFrameInStill(face: StillFace, width: number, height: number): PixelRect | null {
  return selfieFrame(
    { x: face.centreX - face.width / 2, y: face.centreY, width: face.width, height: 0 },
    width,
    height,
  );
}

/** PURE. The cut selfie's width: at most SELFIE_MAX_WIDTH, never upscaled. */
export function selfieOutputWidth(rect: PixelRect): number {
  return Math.min(SELFIE_MAX_WIDTH, rect.width);
}
