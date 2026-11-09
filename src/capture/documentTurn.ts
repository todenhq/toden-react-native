// ---------------------------------------------------------------------------
// Turning a long document upright on a phone held upright.
//
// A NIN slip is 2.07 times as long as it is tall. Framed landscape on a phone
// held upright, the frame is limited by the screen's width and the slip comes
// out small; turned upright it uses the screen's height between the camera's
// top controls and its bottom bar, which gives the slip's small print more
// pixels.
//
// The same rule is mirrored in the Flutter SDK (document_turn.dart) and the web
// SDK (document-turn.ts): change all three together.
// ---------------------------------------------------------------------------

import { countSignalHits, DOCUMENT_SIGNALS } from './documentSignals';
import {
  bottomRowReserve,
  GUIDE_GAP_ABOVE_CONTROLS,
  GUIDE_GAP_BELOW_TOP_BAR,
  TOP_BAR_HEIGHT,
  topBarTop,
} from './immersiveLayout';

/** Documents at least this long are turned upright. Only the NIN slip today. */
export const TURN_MIN_ASPECT = 1.8;

/**
 * The slip is shown turned a quarter clockwise: its top edge faces the RIGHT of
 * the screen. Reading it upright then takes three more clockwise quarter turns.
 */
export const DEFAULT_READ_TURN = 3;

/** True when the document is turned upright for this camera view. */
export function turnsDocument(documentAspect: number, viewAspect: number): boolean {
  return documentAspect >= TURN_MIN_ASPECT && viewAspect > 0 && viewAspect < 1;
}

/** The guide's on-screen width over height: upright when turned. */
export function screenGuideAspect(documentAspect: number, turned: boolean): number {
  return turned ? 1 / documentAspect : documentAspect;
}

/**
 * The crop box for a picked photo, shaped as the camera guide would be: the
 * document camera fills the screen, so on a screen taller than wide a NIN slip
 * stands upright here too. A `turned` crop is turned back to landscape
 * (undoDegrees) before it is stored, as an upright capture is.
 */
export function documentCropGuide(documentAspect: number, screenAspect: number): { aspect: number; turned: boolean } {
  const turned = turnsDocument(documentAspect, screenAspect);
  return { aspect: screenGuideAspect(documentAspect, turned), turned };
}

/**
 * Clockwise degrees that turn a capture of the upright frame back into a
 * landscape document. `readTurn` is the extra clockwise quarter turns that let
 * the text reader read the document (1 or 3); without one, the default
 * direction is assumed. The server copes with a wrong guess: it detects how a
 * page is rotated.
 */
export function undoDegrees(readTurn: number | null): number {
  const turn = readTurn === 1 || readTurn === 3 ? readTurn : DEFAULT_READ_TURN;
  return turn * 90;
}

/**
 * True when text read at one turn names the document itself (a NIN slip's
 * "NIMC", "TRACKING ID"...). Only such a read proves the direction: a read
 * the wrong way round is garbage, and remembering its turn because the slip
 * was still held steady from an earlier frame stored the photo upside down.
 */
export function readProvesTurn(lines: string[], country: string, idType: string): boolean {
  const keywords = DOCUMENT_SIGNALS[country]?.[idType] ?? [];
  if (keywords.length === 0 || lines.length === 0) return false;
  return countSignalHits(lines.join('\n').toUpperCase(), keywords) >= 1;
}

export interface GuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Share of the view's width the guide may take. */
export const GUIDE_WIDTH_FRACTION = 0.88;

/**
 * The guide's rectangle in a view of `width` × `height`.
 *
 * Landscape (the usual case) is unchanged: 88% of the width, centred. Upright,
 * it fills the free band between the top controls (`topReserve`) and the
 * bottom bar (`bottomReserve`), centred in that band, never wider than 88% of
 * the width. The overlay, the sample drawing and the guide crop all use this,
 * so the crop is exactly what was drawn.
 */
export function guideRect(
  width: number,
  height: number,
  aspect: number,
  band?: { topReserve: number; bottomReserve: number },
): GuideRect {
  const maxW = width * GUIDE_WIDTH_FRACTION;
  if (aspect >= 1 || !band) {
    const gh = maxW / aspect;
    return { x: (width - maxW) / 2, y: (height - gh) / 2, width: maxW, height: gh };
  }
  const bandH = Math.max(0, height - band.topReserve - band.bottomReserve);
  const gh = Math.min(bandH, maxW / aspect);
  const gw = gh * aspect;
  return { x: (width - gw) / 2, y: band.topReserve + (bandH - gh) / 2, width: gw, height: gh };
}

/**
 * The screen space above and below the free band an upright guide may use on
 * the full-screen camera. An upright guide is a turned NIN slip, whose hint is
 * drawn turned beside it (turnedHint.ts), so above it is only the top bar
 * (back, document pill, side badge) and 16 of clear space; below it, 24 of
 * clear space and the bottom row (upload, shutter, torch). The numbers are
 * the overlay's own (immersiveLayout.ts), so the band always matches what is
 * drawn.
 */
export function immersiveBand(topInset: number, bottomInset: number): { topReserve: number; bottomReserve: number } {
  return {
    topReserve: topBarTop(topInset) + TOP_BAR_HEIGHT + GUIDE_GAP_BELOW_TOP_BAR,
    bottomReserve: bottomRowReserve(bottomInset) + GUIDE_GAP_ABOVE_CONTROLS,
  };
}

/** `rect` as shares of the view, for the crop. */
export function guideFractions(rect: GuideRect, width: number, height: number): GuideRect {
  return { x: rect.x / width, y: rect.y / height, width: rect.width / width, height: rect.height / height };
}
