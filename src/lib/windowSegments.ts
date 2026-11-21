import type { Size } from './livenessCutout';

// ---------------------------------------------------------------------------
// The window's outline cut into equal parts: one per stage of the test
// (positioning, each step, the capture), with a small gap between them, so the
// line shows how many stages there are and which one is filling.
//
// The same outline as windowOutline (clockwise from twelve o'clock), split by
// distance along it. Mirrors the web SDK's lib/window-segments.ts and the Flutter SDK's _CaptureRingPainter, which
// takes its parts from the path's own metric; here each part is written out as
// its own path, because the line is revealed with a dash offset and a part
// that is its own path needs only that one number per frame.
// ---------------------------------------------------------------------------

/** Gap between two parts, along the line. The ends are round, so what is seen
 *  is this less one stroke width: 6 with the line at 6 (WindowRing). */
export const SEGMENT_GAP = 12;

export interface OutlineSegment {
  d: string;
  /** Where this part starts and ends, as distances along the whole outline. */
  from: number;
  to: number;
}

interface Piece {
  length: number;
  arc: boolean;
  /** The point at [t] (0..length) along this piece. */
  at: (t: number) => [number, number];
}

function pieces(window: Size, inset: number): { list: Piece[]; r: number } {
  const w = window.width - inset * 2;
  const h = window.height - inset * 2;
  const r = w / 2;
  const x0 = inset;
  const y0 = inset;
  const x1 = x0 + w;
  const y1 = y0 + h;
  const cx = x0 + r;
  const side = Math.max(0, h - w);
  // Angles run clockwise from twelve o'clock.
  const arc = (cy: number, start: number, sweep: number): Piece => ({
    length: r * sweep,
    arc: true,
    at: (t) => {
      const a = start + t / r;
      return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    },
  });
  const list: Piece[] = [
    arc(y0 + r, 0, Math.PI / 2),
    { length: side, arc: false, at: (t) => [x1, y0 + r + t] },
    arc(y1 - r, Math.PI / 2, Math.PI),
    { length: side, arc: false, at: (t) => [x0, y1 - r - t] },
    arc(y0 + r, (3 * Math.PI) / 2, Math.PI / 2),
  ];
  return { list, r };
}

const n = (v: number): string => v.toFixed(2);

/** The path from [from] to [to] along the outline, carrying on from [d]. */
function trace(list: Piece[], r: number, from: number, to: number, d = ''): string {
  let out = d;
  let start = 0;
  for (const piece of list) {
    const end = start + piece.length;
    const a = Math.max(from, start);
    const b = Math.min(to, end);
    if (piece.length > 0 && b > a) {
      if (out === '') {
        const [mx, my] = piece.at(a - start);
        out = `M${n(mx)} ${n(my)}`;
      }
      const [x, y] = piece.at(b - start);
      out += piece.arc ? ` A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y)}` : ` L${n(x)} ${n(y)}`;
    }
    start = end;
  }
  return out;
}

/**
 * The outline in [parts] equal parts. One part is the whole outline with no
 * gap. [inset] pulls the line in by half its stroke, as windowOutline does.
 */
export function outlineSegments(window: Size, inset: number, parts: number, gap = SEGMENT_GAP): OutlineSegment[] {
  const { list, r } = pieces(window, inset);
  const total = list.reduce((sum, p) => sum + p.length, 0);
  const count = Math.max(1, Math.floor(parts));
  const each = total / count;
  // A gap that would swallow the part it separates is no gap at all.
  const g = count === 1 || gap >= each ? 0 : gap;
  const out: OutlineSegment[] = [];
  for (let i = 0; i < count; i++) {
    const from = i * each + g / 2;
    const to = (i + 1) * each - g / 2;
    out.push({ d: trace(list, r, from, to), from, to });
  }
  return out;
}

/** A side of the window, as the person sees it on screen. */
export type WindowSide = 'top' | 'right' | 'bottom' | 'left';
export const WINDOW_SIDES: readonly WindowSide[] = ['top', 'right', 'bottom', 'left'];

/**
 * The outline in four equal parts, one per SIDE of the window: each is centred
 * on its side, so the gaps fall at the window's four shoulders rather than at
 * twelve, three, six and nine o'clock. The head directions light the side the
 * head should go to (screens/liveness/SideRing).
 */
export function sideSegments(window: Size, inset: number, gap = SEGMENT_GAP): Record<WindowSide, string> {
  const { list, r } = pieces(window, inset);
  const total = list.reduce((sum, p) => sum + p.length, 0);
  const each = total / 4;
  const g = gap >= each ? 0 : gap;
  const part = (i: number): string => {
    const from = (i - 0.5) * each + g / 2;
    const to = (i + 0.5) * each - g / 2;
    // The top side starts before twelve o'clock, where the outline begins: it
    // is the end of the outline, then its beginning.
    return from < 0 ? trace(list, r, 0, to, trace(list, r, from + total, total)) : trace(list, r, from, to);
  };
  return { top: part(0), right: part(1), bottom: part(2), left: part(3) };
}

/**
 * How much of a part the line has reached, 0..1, when it has travelled [done]
 * along the whole outline.
 */
export function segmentFill(segment: OutlineSegment, done: number): number {
  const span = segment.to - segment.from;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (done - segment.from) / span));
}
