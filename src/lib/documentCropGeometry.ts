// ---------------------------------------------------------------------------
// The photo cropper's geometry (components/DocumentCropper.tsx), kept pure so
// the box's shape, its first placement and the Rotate refit are unit-tested.
// Mirrors the Flutter widget's maths (widgets/document_cropper.dart).
// ---------------------------------------------------------------------------

export interface CropRectangle {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The photo's rect inside the stage, shown "contain". */
export function containRect(natW: number, natH: number, cw: number, ch: number): CropRectangle {
  const natAR = natW / natH;
  const conAR = cw / ch;
  let rw: number;
  let rh: number;
  if (natAR > conAR) {
    rw = cw;
    rh = cw / natAR;
  } else {
    rh = ch;
    rw = ch * natAR;
  }
  return { x: (cw - rw) / 2, y: (ch - rh) / 2, w: rw, h: rh };
}

/**
 * Clear space between the photo and the edge of its stage, so a crop handle at
 * the photo's edge never touches the screen's (the scan screen's side margin).
 */
export const CROP_STAGE_INSET = 16;

/** The photo's rect inside the stage, shown "contain" within `inset` on every side. */
export function insetContainRect(natW: number, natH: number, cw: number, ch: number, inset = CROP_STAGE_INSET): CropRectangle {
  const r = containRect(natW, natH, Math.max(1, cw - 2 * inset), Math.max(1, ch - 2 * inset));
  return { x: r.x + inset, y: r.y + inset, w: r.w, h: r.h };
}

/** The first box: 85% of the photo's width, centred, at `ar`; capped at 90% of its height. */
export function initialCropRect(img: CropRectangle, ar: number): CropRectangle {
  let w = img.w * 0.85;
  let h = w / ar;
  if (h > img.h * 0.9) {
    h = img.h * 0.9;
    w = h * ar;
  }
  return { x: img.x + (img.w - w) / 2, y: img.y + (img.h - h) / 2, w, h };
}

/** Keeps the box inside the photo, at `ar`, no narrower than 60. */
export function clampCropRect(crop: CropRectangle, b: CropRectangle, ar: number): CropRectangle {
  let w = Math.min(Math.max(crop.w, 60), b.w);
  let h = w / ar;
  if (h > b.h) {
    h = b.h;
    w = h * ar;
    if (w > b.w) {
      w = b.w;
      h = w / ar;
    }
  }
  const maxLeft = Math.max(b.x, b.x + b.w - w);
  const maxTop = Math.max(b.y, b.y + b.h - h);
  return {
    x: Math.min(Math.max(crop.x, b.x), maxLeft),
    y: Math.min(Math.max(crop.y, b.y), maxTop),
    w,
    h,
  };
}

/** A photo's size after `turns` clockwise quarter turns (Rotate). */
export function turnedSize(size: { w: number; h: number }, turns: number): { w: number; h: number } {
  return turns % 2 === 0 ? size : { w: size.h, h: size.w };
}

/**
 * Rotate's animation: the scale that takes the photo as shown (`from`), turned a
 * quarter about its centre, onto the rect the turned photo will be shown at
 * (`to`). Both are centred on the same stage, so a scale is all it needs: a
 * portrait photo turning landscape shrinks into the stage as it turns, rather
 * than overflowing and snapping back.
 */
export function quarterTurnScale(from: CropRectangle, to: CropRectangle): number {
  // Turned, the photo's width on screen is its height as shown.
  return from.h > 0 ? to.w / from.h : 1;
}
