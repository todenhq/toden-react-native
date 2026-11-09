// ---------------------------------------------------------------------------
// The four-corner gate: a document is captured only when all four of its
// corners are in the frame, with a little space (the BLEED) past each one.
//
// Why: people photograph a passport with the machine-readable zone running off
// the bottom of the frame, and a cut MRZ cannot be read. The guide alone could
// not stop that, because it only says where the document SHOULD be.
//
// Pure, and shared with the web and Flutter SDKs through
// documentCorners.vectors.json — change a rule there and in all three SDKs.
// Coordinates are normalised 0..1 in the captured, upright frame: x to the
// right, y down.
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface DocumentQuad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

/** The part of the frame the preview shows (normalised, same space as the quad). */
export interface VisibleRegion {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type CornersProblem = 'no_document' | 'corner_cut_off' | 'too_close';

/** Space kept past every corner, as a fraction of the frame's width (x) and height (y). */
export const CORNER_BLEED = 0.04;
/** A corner this close to a visible edge is treated as clipped by it. */
export const EDGE_EPSILON = 0.005;
/** Below this share of the frame the shape is noise, not a document. */
export const MIN_AREA_FRACTION = 0.05;

type Corners = [Point, Point, Point, Point];

function cornersOf(q: DocumentQuad): Corners {
  return [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
}

/** Each corner with the one after it, wrapping round. */
function edges(pts: Corners): [Point, Point, Point][] {
  const [a, b, c, d] = pts;
  return [[a, b, c], [b, c, d], [c, d, a], [d, a, b]];
}

/** Shoelace area of the quad, as a share of the frame. */
function area(pts: Corners): number {
  let sum = 0;
  for (const [a, b] of edges(pts)) sum += a.x * b.y - b.x * a.y;
  return Math.abs(sum) / 2;
}

/**
 * Every turn in the same direction. A crossed ("bow-tie") quad turns both ways,
 * so this also rejects self-intersecting corners.
 */
function isConvex(pts: Corners): boolean {
  let sign = 0;
  for (const [a, b, c] of edges(pts)) {
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign !== 0 && s !== sign) return false;
    sign = s;
  }
  return true;
}

function isFinitePoint(p: Point | undefined): boolean {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/**
 * Judge the detected corners against what the preview shows. Null means the
 * document may be captured. Checks run strongest first: no document at all,
 * then a corner off (or on) the edge, then a corner without its bleed.
 */
export function cornersProblem(
  quad: DocumentQuad | null,
  visible: VisibleRegion,
  bleed: number = CORNER_BLEED,
): CornersProblem | null {
  if (!quad) return 'no_document';
  const pts = cornersOf(quad);
  if (!pts.every(isFinitePoint)) return 'no_document';
  if (!isConvex(pts) || area(pts) < MIN_AREA_FRACTION) return 'no_document';

  const outside = (p: Point, margin: number): boolean =>
    p.x < visible.left + margin ||
    p.x > visible.right - margin ||
    p.y < visible.top + margin ||
    p.y > visible.bottom - margin;

  if (pts.some((p) => outside(p, EDGE_EPSILON))) return 'corner_cut_off';
  if (pts.some((p) => outside(p, bleed))) return 'too_close';
  return null;
}

/**
 * How much larger than the drawn guide the found document may be before it
 * counts as held too close. A document much bigger than the guide is running
 * off the picture, and what was found is a box printed inside it (a NIN slip's
 * bordered table), so capturing would cut the edges off.
 */
export const GUIDE_OVERSIZE = 1.15;

/**
 * True when the quad is more than GUIDE_OVERSIZE times the guide's width or
 * height. `guide` is in the same normalised frame space as the quad.
 */
export function exceedsGuide(quad: DocumentQuad, guide: VisibleRegion, factor: number = GUIDE_OVERSIZE): boolean {
  const pts = cornersOf(quad);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w > (guide.right - guide.left) * factor || h > (guide.bottom - guide.top) * factor;
}

/** A crop in whole pixels of the frame the quad was measured in. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Normalised coordinates times a pixel size can land a hair off a whole number
// (0.57 * 100 is 56.99999999999999). Without this slack, floor/ceil would add a
// stray pixel that another SDK's arithmetic does not.
const PIXEL_SLACK = 1e-6;

/**
 * The quad's bounding box, grown by the bleed on every side and clamped to the
 * frame: what the saved photo keeps, so it always has space past each corner.
 */
export function bleedCropRect(
  quad: DocumentQuad,
  frame: { width: number; height: number },
  bleed: number = CORNER_BLEED,
): PixelRect {
  const pts = cornersOf(quad);
  const xs = pts.map((p) => p.x * frame.width);
  const ys = pts.map((p) => p.y * frame.height);
  const padX = bleed * frame.width;
  const padY = bleed * frame.height;
  const left = Math.max(0, Math.floor(Math.min(...xs) - padX + PIXEL_SLACK));
  const top = Math.max(0, Math.floor(Math.min(...ys) - padY + PIXEL_SLACK));
  const right = Math.min(frame.width, Math.ceil(Math.max(...xs) + padX - PIXEL_SLACK));
  const bottom = Math.min(frame.height, Math.ceil(Math.max(...ys) + padY - PIXEL_SLACK));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
