// ---------------------------------------------------------------------------
// What the full-screen selfie review shows, and where.
//
// The selfie that is uploaded is a tight 3:4 cut round the face
// (lib/selfie-pick.ts). The review used to show that cut in the window, over
// the same photo blurred heavily behind it: a different picture from the one
// the camera had shown (user report 2026-11-17, on web: "that was not how it
// looked when it was captured ... it must always fit the frame on all
// devices"; the heavy blur was rejected the same day).
//
// So the review shows the whole STILL the selfie was cut from, drawn the way
// the camera drew it: filling the screen, under the same light blur round the
// window. Two things are done for the face, in this order:
//
//   it fits         A face held close enough to spill over the window makes
//                   the picture smaller until it fits, and the face is kept
//                   inside the window's edges. This can leave a strip of the
//                   screen without picture, which the view fades out rather
//                   than cutting off.
//   it is central   As far as that goes without uncovering the screen.
//
// Where the face sits in the still comes from the detector's face, mapped
// into the still by stillFace (lib/selfie-pick.ts): the same mapping the cut
// itself relies on, so the review and the uploaded selfie agree.
//
// Pure. A port of the web SDK's lib/selfie-review.ts and the Flutter SDK's
// liveness/selfie_review.dart.
// ---------------------------------------------------------------------------

import type { Rect, Size } from './livenessCutout';
import type { StillFace } from './selfie-pick';

/** Where the face is in a picture, in shares of it: its top left and size. */
export interface ShareBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The still a selfie was cut from. Kept on the phone; never uploaded. */
export interface SelfieScene {
  /** The still, mirrored as the person saw it. */
  uri: string;
  width: number;
  height: number;
  /** Where the face is, in shares of the still. */
  face: ShareBox;
}

/** The face is at most this share of the window's width and height. */
export const REVIEW_FACE_MAX_FILL = 0.8;

/** Where the picture stops short of the screen, it fades out over this. */
export const REVIEW_SCENE_FADE = 56;

/**
 * PURE. The face box from the detector's centre and width (shares of the
 * still's width). The detectors' face boxes are about square, so its height
 * in pixels is taken as its width.
 */
export function faceShareBox(face: StillFace, width: number, height: number): ShareBox {
  const share = height <= 0 ? face.width : (face.width * width) / height;
  return { x: face.centreX - face.width / 2, y: face.centreY - share / 2, width: face.width, height: share };
}

/** One axis: central where the picture covers, and the face inside the window always. */
function along(
  screen: number,
  size: number,
  faceStart: number,
  faceSize: number,
  windowStart: number,
  windowSize: number,
): number {
  const central = windowStart + windowSize / 2 - (faceStart + faceSize / 2) * size;
  const covering = size >= screen ? Math.min(0, Math.max(screen - size, central)) : (screen - size) / 2;
  // The face's near edge not before the window's, its far edge not past it.
  const least = windowStart - faceStart * size;
  const most = windowStart + windowSize - (faceStart + faceSize) * size;
  return Math.min(most, Math.max(least, covering));
}

/**
 * PURE. Where the still goes on the review, in the screen's own points.
 * [window] is the face window as the camera drew it.
 */
export function sceneOnReview(scene: Size, face: ShareBox, frame: Size, window: Rect): Rect {
  const cover = Math.max(frame.width / scene.width, frame.height / scene.height);
  // How much of the window the face takes drawn as the camera drew it.
  const fill = Math.max(
    (face.width * scene.width * cover) / window.width,
    (face.height * scene.height * cover) / window.height,
  );
  const scale = cover * Math.min(1, REVIEW_FACE_MAX_FILL / fill);
  const width = scene.width * scale;
  const height = scene.height * scale;
  return {
    x: along(frame.width, width, face.x, face.width, window.x, window.width),
    y: along(frame.height, height, face.y, face.height, window.y, window.height),
    width,
    height,
  };
}

/** PURE. Which edges of the screen the picture does not reach. */
export function uncovered(at: Rect, frame: Size): { left: boolean; right: boolean; top: boolean; bottom: boolean } {
  return {
    left: at.x > 0.5,
    right: at.x + at.width < frame.width - 0.5,
    top: at.y > 0.5,
    bottom: at.y + at.height < frame.height - 0.5,
  };
}

/** One fade over the picture's edge: where it is drawn and which way it runs, opaque end first. */
export interface Fade {
  id: string;
  box: Rect;
  /** The gradient's direction, from the opaque end to the clear one. */
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** PURE. The fades over the picture's edges that stop short of the screen. */
export function sceneFades(at: Rect, frame: Size): Fade[] {
  const gaps = uncovered(at, frame);
  const across = Math.min(REVIEW_SCENE_FADE, at.width / 2);
  const down = Math.min(REVIEW_SCENE_FADE, at.height / 2);
  const fades: Fade[] = [];
  if (gaps.left) fades.push({ id: 'left', box: { x: at.x, y: at.y, width: across, height: at.height }, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } });
  if (gaps.right) fades.push({ id: 'right', box: { x: at.x + at.width - across, y: at.y, width: across, height: at.height }, from: { x: 1, y: 0 }, to: { x: 0, y: 0 } });
  if (gaps.top) fades.push({ id: 'top', box: { x: at.x, y: at.y, width: at.width, height: down }, from: { x: 0, y: 0 }, to: { x: 0, y: 1 } });
  if (gaps.bottom) fades.push({ id: 'bottom', box: { x: at.x, y: at.y + at.height - down, width: at.width, height: down }, from: { x: 0, y: 1 }, to: { x: 0, y: 0 } });
  return fades;
}
