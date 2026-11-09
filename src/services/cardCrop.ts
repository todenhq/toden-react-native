// Pure card-crop geometry — no native imports, so it's unit-testable in the
// plain-node jest env. The RN mirror of the math in the Flutter SDK's
// `_cropCardWorker`: the live-camera preview is shown BoxFit.cover in a fixed 3:4
// box with the ID-card guide centred at 88% width and `aspect` height; this maps
// that guide rectangle to pixel coordinates of the captured photo.

import { bleedCropRect, type DocumentQuad, type Point, type VisibleRegion } from '../capture/documentCorners';

/** A crop rectangle in source-image pixels. */
export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** Legacy framed-viewfinder aspect — only correct when capture runs in the 3:4 box. */
export const FRAMED_VIEW_AR = 3 / 4;
const GUIDE_WIDTH_FRACTION = 0.88; // card width as a fraction of the box (overlay GW/VB_W)

/**
 * Given the photo's pixel size, the guide `aspect` (width ÷ height), and the
 * aspect of the box the preview ACTUALLY rendered in, return the card-guide
 * crop rect in photo pixels:
 *   1. the cover-fit box shows a centred `viewAr` slice of the photo,
 *   2. the guide is centred in that slice (88% wide, `aspect` ratio).
 *
 * `viewAr` is a parameter because assuming it was the bug: this math was
 * written for the framed 3:4 viewfinder, and capture then moved to a
 * FULL-SCREEN modal (~9:19.5) without the constant following. A cover-fit
 * 3:4 slice of the photo is far wider than the slice a full-screen preview
 * shows, so every review image came back ~1.6× wider than what the user had
 * framed. The caller passes the MEASURED box aspect, so the crop and the
 * preview agree by construction.
 */
export function cardCropRect(
  imageW: number,
  imageH: number,
  aspect: number,
  viewAr: number = FRAMED_VIEW_AR,
): CropRect {
  const photoAR = imageW / imageH;
  let visW: number;
  let visH: number;
  let offX: number;
  let offY: number;
  if (photoAR > viewAr) {
    visH = imageH;
    visW = imageH * viewAr;
    offX = (imageW - visW) / 2;
    offY = 0;
  } else {
    visW = imageW;
    visH = imageW / viewAr;
    offX = 0;
    offY = (imageH - visH) / 2;
  }
  const leftFraction = (1 - GUIDE_WIDTH_FRACTION) / 2;
  // card height ÷ box height = (cardWidthFrac · boxWidth / aspect) / boxHeight,
  // and boxWidth ÷ boxHeight = viewAr.
  const heightFraction = (GUIDE_WIDTH_FRACTION * viewAr) / aspect;
  const topFraction = (1 - heightFraction) / 2;
  return {
    originX: offX + leftFraction * visW,
    originY: offY + topFraction * visH,
    width: GUIDE_WIDTH_FRACTION * visW,
    height: heightFraction * visH,
  };
}

/**
 * The photo pixels behind a guide drawn at `guide` (shares of the preview box,
 * as documentTurn's guideFractions gives them). Used for an upright guide,
 * which is not the centred 88%-wide frame `cardCropRect` assumes.
 */
export function guideCropRect(
  imageW: number,
  imageH: number,
  viewAr: number,
  guide: { x: number; y: number; width: number; height: number },
): CropRect {
  const photoAR = imageW / imageH;
  const visW = photoAR > viewAr ? imageH * viewAr : imageW;
  const visH = photoAR > viewAr ? imageH : imageW / viewAr;
  const offX = (imageW - visW) / 2;
  const offY = (imageH - visH) / 2;
  return {
    originX: offX + guide.x * visW,
    originY: offY + guide.y * visH,
    width: guide.width * visW,
    height: guide.height * visH,
  };
}

// ── Corner-based crop ─────────────────────────────────────────────────────────
//
// When the document's corners were detected, the crop follows the DOCUMENT
// rather than the painted guide, so the saved photo keeps space past every
// corner and a passport's machine-readable zone is never cut off.

/** Which part of a frame a cover-fit preview shows (normalised 0..1). */
export function coverVisibleRegion(frameAr: number, viewAr: number): VisibleRegion {
  if (!(frameAr > 0) || !(viewAr > 0)) return { left: 0, top: 0, right: 1, bottom: 1 };
  if (frameAr > viewAr) {
    // The frame is wider than the view: its sides are cropped off.
    const w = viewAr / frameAr;
    return { left: (1 - w) / 2, top: 0, right: (1 + w) / 2, bottom: 1 };
  }
  const h = frameAr / viewAr;
  return { left: 0, top: (1 - h) / 2, right: 1, bottom: (1 + h) / 2 };
}

/** Phone sensors are 4:3; upright, the long side runs the way the frame's does. */
function sensorAr(frameAr: number): number {
  return frameAr > 1 ? 4 / 3 : 3 / 4;
}

/** A centred rectangle of aspect `ar`, as large as fits the sensor: its share of each side. */
function inscribed(ar: number, sensor: number): { w: number; h: number } {
  return ar < sensor ? { w: ar / sensor, h: 1 } : { w: 1, h: sensor / ar };
}

/**
 * Re-express a quad measured in the camera FRAME in the captured PHOTO.
 *
 * The frame-processor stream and the still can differ in aspect (a 16:9 stream
 * beside a 4:3 photo). Both are cut from one sensor about its centre, each as
 * large as its aspect allows, so a point is carried frame → sensor → photo.
 * Equal aspects are the identity.
 */
export function quadInImage(quad: DocumentQuad, frameAr: number, imageAr: number): DocumentQuad {
  if (!(frameAr > 0) || !(imageAr > 0) || Math.abs(frameAr - imageAr) < 1e-3) return quad;
  const sensor = sensorAr(frameAr);
  const f = inscribed(frameAr, sensor);
  const i = inscribed(imageAr, sensor);
  const axis = (v: number, fs: number, is: number): number => ((1 - fs) / 2 + v * fs - (1 - is) / 2) / is;
  const map = (p: Point): Point => ({ x: axis(p.x, f.w, i.w), y: axis(p.y, f.h, i.h) });
  return {
    topLeft: map(quad.topLeft),
    topRight: map(quad.topRight),
    bottomRight: map(quad.bottomRight),
    bottomLeft: map(quad.bottomLeft),
  };
}

/** The bleed crop of a detected document, in the photo's pixels. */
export function cornerCropRect(
  imageW: number,
  imageH: number,
  quad: DocumentQuad,
  frameAr: number,
): CropRect {
  const r = bleedCropRect(quadInImage(quad, frameAr, imageW / imageH), { width: imageW, height: imageH });
  return { originX: r.x, originY: r.y, width: r.width, height: r.height };
}
