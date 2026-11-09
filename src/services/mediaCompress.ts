import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Video } from 'react-native-compressor';

import {
  DOCUMENT_IMAGE_QUALITY,
  DOCUMENT_MAX_DIMENSION,
  SELFIE_IMAGE_QUALITY,
  VIDEO_COMPRESS_BITRATE,
  VIDEO_COMPRESS_MAX_SIZE,
  VIDEO_COMPRESS_FALLBACK_SIZE,
  VIDEO_COMPRESS_FALLBACK_BITRATE,
} from '../config/captureSettings';
import type { PhotoPreparers } from './pickedPhoto';
import { cardCropRect, cornerCropRect, guideCropRect, type CropRect } from './cardCrop';
import { selfieFrameInStill, selfieOutputWidth, type StillFace } from '../lib/selfie-pick';
import type { DocumentQuad } from '../capture/documentCorners';

export type { CropRect } from './cardCrop';

/**
 * Transcodes a recorded clip down to a small evidence video. VisionCamera v5
 * records at the document camera's high-res 4K session format on iOS and
 * ignores the bitrate/resolution hints, so the raw file is far too large; this
 * shrinks it (mirrors the Flutter SDK's video_compress).
 *
 * A failed transcode is retried once at a smaller size. If that fails too it
 * answers null: the raw 4K file is never uploaded, because it cannot fit the
 * 5 MB ceiling and used to be dropped there without anyone being told.
 */
export async function compressVideo(uri: string): Promise<string | null> {
  const attempts = [
    { maxSize: VIDEO_COMPRESS_MAX_SIZE, bitrate: VIDEO_COMPRESS_BITRATE },
    { maxSize: VIDEO_COMPRESS_FALLBACK_SIZE, bitrate: VIDEO_COMPRESS_FALLBACK_BITRATE },
  ];
  for (const { maxSize, bitrate } of attempts) {
    try {
      const out = await Video.compress(uri, { compressionMethod: 'manual', maxSize, bitrate });
      return out.startsWith('file://') ? out : `file://${out}`;
    } catch {
      /* try the next, smaller setting */
    }
  }
  return null;
}

// Post-capture still-image compression — the RN mirror of the Flutter SDK's
// media_compress_service.dart (and the web SDK's useImageCompress). Effort scales
// to need:
//   • DOCUMENT — conservative (OCR-critical): JPEG q0.9, only downscaled when the
//     longest edge exceeds DOCUMENT_MAX_DIMENSION, so small text stays legible.
//   • SELFIE   — moderate: JPEG q0.8, capped to ~1280 px.
// Runs natively via expo-image-manipulator (off the JS thread).

/**
 * The image's TRUE pixel dimensions.
 *
 * Measured through expo-image-manipulator — the same native module that does
 * the cropping — because the two must agree, and they did not.
 *
 * This used `Image.getSize`, which on Android reports DP (pixels ÷ display
 * density), while ImageManipulator crops in real pixels. On a density-2 phone
 * a 3048x4064 photo measured 1524x2032, so a crop rect computed as "centred"
 * was applied at half scale and landed in the UPPER-LEFT QUADRANT of the real
 * image. Every Android document capture cropped the wrong region — the card
 * the applicant framed was simply not in the stored photo. iOS was unaffected
 * (getSize returns pixels there), which is how an iPhone-led test history
 * never saw it. Found on a TECNO KM5 (density 320 → scale 2.0), 2026-09-20:
 * reported 1524x2032 against a true 3048x4064, a factor of exactly 2.
 *
 * Correcting by `PixelRatio.get()` would also work on today's devices, but it
 * re-states the cropper's units somewhere else and leaves the same class of
 * bug one refactor away. Asking the cropper itself cannot drift from it.
 */
export async function imageSize(uri: string): Promise<{ width: number; height: number }> {
  const ref = await ImageManipulator.ImageManipulator.manipulate(uri).renderAsync();
  return { width: ref.width, height: ref.height };
}

/**
 * Crop [uri] to [rect] (source-image pixels) and return a new high-quality JPEG
 * URI — the RN mirror of the Flutter SDK's `cropAndCompress` / `cropCardRegion`.
 * Kept near-lossless here (q0.95); OCR-grade sizing happens in
 * `compressDocumentImage` afterwards, exactly like Flutter.
 */
export async function cropImage(uri: string, rect: CropRect): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX: Math.round(rect.originX), originY: Math.round(rect.originY), width: Math.round(rect.width), height: Math.round(rect.height) } }],
    { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

/**
 * Crop a live-camera capture to the card-guide rectangle painted over the
 * viewfinder — the RN mirror of the Flutter SDK's `cropCardRegion`.
 *
 * The CameraViewfinder shows the preview `BoxFit.cover` inside a fixed 3:4 box,
 * with the guide centred at 88% width and `aspect` height (mirrors the SVG
 * overlay). So the crop is computed purely from the photo's pixel size + those
 * fractions — no absolute viewfinder size needed:
 *   1. the 3:4 box shows a centred 3:4 slice of the photo (cover),
 *   2. the guide is a sub-rect of that slice (88% wide, `aspect` ratio, centred).
 */
/**
 * Crop a live-camera capture to the card-guide rectangle painted over the
 * viewfinder — the RN mirror of the Flutter SDK's `cropCardRegion`. The
 * CameraViewfinder shows the preview `BoxFit.cover` in a fixed 3:4 box with the
 * guide centred at 88% width and `aspect` height (mirrors the SVG overlay).
 */
export async function cropCardRegion(
  uri: string,
  aspect: number,
  /** Aspect of the box the preview actually rendered in (width ÷ height). */
  viewAr?: number,
): Promise<string> {
  const { width, height } = await imageSize(uri);
  return cropImage(uri, cardCropRect(width, height, aspect, viewAr));
}

/**
 * Crop a live-camera capture to the document's DETECTED corners, with the
 * corner-gate bleed past each one, so a passport's MRZ is never cut off by the
 * crop. Used whenever the corner gate passed; the guide crop above is only the
 * fallback for a build that cannot detect corners.
 */
export async function cropToDocumentCorners(
  uri: string,
  quad: DocumentQuad,
  /** Upright frame width ÷ height the quad was measured in, when known. */
  frameAspect: number | null,
): Promise<string> {
  const { width, height } = await imageSize(uri);
  const rect = cornerCropRect(width, height, quad, frameAspect ?? width / height);
  if (rect.width < 2 || rect.height < 2) return uri;
  return cropImage(uri, rect);
}

/** Crop a live-camera capture to an upright guide drawn at `guide` (shares of the preview box). */
export async function cropGuideRegion(
  uri: string,
  viewAr: number,
  guide: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const { width, height } = await imageSize(uri);
  return cropImage(uri, guideCropRect(width, height, viewAr, guide));
}

/** Turn an image clockwise by `degrees` (a multiple of 90). Returns a new file URI. */
export async function rotateImage(uri: string, degrees: number): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ rotate: degrees }], {
    compress: 0.95,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

/** Compress a document still for OCR. Returns a new file URI. */
export async function compressDocumentImage(uri: string): Promise<string> {
  let actions: ImageManipulator.Action[] = [];
  try {
    const { width, height } = await imageSize(uri);
    const longest = Math.max(width, height);
    if (longest > DOCUMENT_MAX_DIMENSION) {
      actions = [
        width >= height
          ? { resize: { width: DOCUMENT_MAX_DIMENSION } }
          : { resize: { height: DOCUMENT_MAX_DIMENSION } },
      ];
    }
  } catch {
    /* size unknown — recompress without resizing */
  }
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: DOCUMENT_IMAGE_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

/** A local file's size in bytes, or null when it cannot be read. */
export function fileSizeOf(uri: string): number | null {
  return new File(uri).size;
}

/** How a picked photo is made fit to upload (services/pickedPhoto). */
export const documentPhotoPreparers: PhotoPreparers = {
  compress: compressDocumentImage,
  sizeOf: fileSizeOf,
};

/** Compress a selfie still (moderate). Returns a new file URI. */
/**
 * The selfie cut to the standard frame (lib/selfie-pick.ts): 3:4, the face
 * 42% of the width, at most 720px wide and never enlarged, as a JPEG at the
 * selfie quality. Null when the face is unknown or too small for the frame:
 * the caller keeps the whole still (compressSelfieImage).
 */
export async function cutSelfie(uri: string, face: StillFace | null): Promise<string | null> {
  if (!face) return null;
  const { width, height } = await imageSize(uri);
  const rect = selfieFrameInStill(face, width, height);
  if (!rect) return null;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX: rect.x, originY: rect.y, width: rect.width, height: rect.height } },
      { resize: { width: selfieOutputWidth(rect) } },
    ],
    { compress: SELFIE_IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function compressSelfieImage(uri: string): Promise<string> {
  let actions: ImageManipulator.Action[] = [];
  try {
    const { width, height } = await imageSize(uri);
    const longest = Math.max(width, height);
    if (longest > 1280) {
      actions = [
        width >= height ? { resize: { width: 1280 } } : { resize: { height: 1280 } },
      ];
    }
  } catch {
    /* size unknown — recompress without resizing */
  }
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: SELFIE_IMAGE_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}
