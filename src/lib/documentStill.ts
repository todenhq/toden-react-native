// How a document photo is finished before it is uploaded.
//
// The server reads a card's barcode from this photo, and a barcode's bars are
// the first thing a small or twice-compressed picture loses: a Nigerian
// driver's licence stopped decoding from web captures and its number fell to a
// vision model (2026-11-21). So the photo keeps the camera's detail (up to
// DOCUMENT_MAX_DIMENSION on its longer side, never scaled below what the crop
// gave) and is compressed ONCE: the crop to the document writes the JPEG that
// is uploaded, and finishing it re-encodes only what did not come from that
// crop (a photo picked from the device, a crop that failed).
//
// Pure, so the rule is tested without the native image module
// (documentStill.test.ts). Mirrors the web SDK's utils/image.ts.

import { DOCUMENT_MAX_DIMENSION } from '../config/captureSettings';

export interface StillSize {
  width: number;
  height: number;
}

/** The resize that brings a picture inside the limit by its longer side; null when it already is. */
export function resizeToLimit(size: StillSize): { width: number } | { height: number } | null {
  if (Math.max(size.width, size.height) <= DOCUMENT_MAX_DIMENSION) return null;
  return size.width >= size.height ? { width: DOCUMENT_MAX_DIMENSION } : { height: DOCUMENT_MAX_DIMENSION };
}

/**
 * What finishing a document still takes. A crop this SDK wrote that is already
 * inside the limit is uploaded as it is: encoding it again would only lose
 * detail. Anything else is encoded here, resized first when it is too large.
 * An unknown size is encoded without resizing.
 */
export function documentStillPlan(
  size: StillSize | null,
  fromCrop: boolean,
): { encode: boolean; resize: { width: number } | { height: number } | null } {
  const resize = size ? resizeToLimit(size) : null;
  return { encode: !(fromCrop && size !== null && resize === null), resize };
}
