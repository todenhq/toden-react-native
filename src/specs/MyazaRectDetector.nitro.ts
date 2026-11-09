import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

// ---------------------------------------------------------------------------
// Nitro spec for document EDGE detection (VisionCamera v5).
//
// iOS asks Apple Vision (`VNDetectRectanglesRequest`). Android has no ML Kit
// equivalent, so it runs a small border detector of its own over the frame's
// luma (DocumentBorderDetector.kt, a port of the web SDK's). Geometry is an
// ADDITIONAL signal beside text recognition, never a replacement:
//
//   • geometry answers "is it framed like a document"
//   • text answers "is it the RIGHT document"
//
// Aspect ratio cannot tell a passport from a driver's licence, so shooting on
// geometry alone would happily capture the wrong document. Both must agree.
//
// The four CORNERS are what the capture gate needs: a document is shot only
// when all four are in view with space past each (see capture/documentCorners).
// A build without this module reports nothing, and the gate steps aside, so a
// platform that cannot measure captures exactly as it did before.
// ---------------------------------------------------------------------------

export interface DetectedRect {
  /** Whether a rectangle was found at all. */
  found: boolean;
  /** Normalised 0..1 bounding box of the detected rectangle. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Width ÷ height of the detected shape — what identifies a card vs a page. */
  aspect: number;
  /** Detector confidence, 0..1. */
  confidence: number;
  /**
   * The four corners, normalised 0..1 in the UPRIGHT frame (x right, y down),
   * whatever the sensor's orientation. Zero when nothing was found.
   */
  topLeftX: number;
  topLeftY: number;
  topRightX: number;
  topRightY: number;
  bottomRightX: number;
  bottomRightY: number;
  bottomLeftX: number;
  bottomLeftY: number;
  /** The upright frame's size in pixels, which the corners are relative to. */
  frameWidth: number;
  frameHeight: number;
}

export interface MyazaRectDetector
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Find the most prominent document-like rectangle in a camera {@link Frame}.
   *
   * Called per-frame from the VisionCamera worklet, so the frame never crosses
   * the JS bridge — only the measured box comes back.
   *
   * Returns `found: false` when nothing qualifies, which is the ordinary case
   * while the user is still aiming.
   */
  detectRect(frame: Frame): DetectedRect;

  /**
   * Look for a long document framed UPRIGHT (a NIN slip on a phone held
   * upright, capture/documentTurn.ts) rather than landscape. Android's border
   * search admits one orientation at a time; iOS needs nothing (Vision's
   * bound is short side over long side).
   */
  setExpectUpright(upright: boolean): void;
}
