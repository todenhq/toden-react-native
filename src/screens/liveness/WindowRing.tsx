import React, { useEffect, useMemo, useRef } from 'react';
import Svg, { Path } from 'react-native-svg';

import { advanceTarget, easeToward } from '../../lib/captureRing';
import { windowOutline, type Size } from '../../lib/livenessCutout';
import { outlineSegments, segmentFill } from '../../lib/windowSegments';

// The progress line of the full-screen camera: CaptureRing's line, traced
// around the tall window instead of a circle. Empty when the test starts,
// closed at the shutter, one way only, starting and ending at twelve o'clock.
// Green from its first pixel, over a track in the frame's own colour.
//
// It is cut into equal PARTS with a small gap between them, one per stage of
// the test, as the Flutter SDK draws it: the person can see how many stages
// there are and which one is filling.
//
// Driven OUTSIDE React exactly as CaptureRing is: `getTarget` is read every
// frame and each part is written with setNativeProps (see that file for why).
// The outline is a PATH written out by hand, not a rounded <Rect>: where a
// rect's stroke begins differs between the two platforms' renderers, and a
// line that starts at nine o'clock on one of them is the kind of thing nobody
// notices until it ships.
//
// It runs a little way OUTSIDE the window, with a clear gap between the two,
// as Apple's face recognition ring does: the line reads as a ring round the
// face rather than as the window's own edge. The web SDK's numbers
// (steps/liveness/WindowRing.tsx).

/** Heavier than the frame's other lines, so it reads round the face over a busy picture. */
export const RING_STROKE = 6;
const STROKE = RING_STROKE;
/** The clear gap between the window's edge and the inside of the line. */
export const RING_GAP = 7;
/** How far the line reaches past the window, its stroke included. */
export const RING_REACH = RING_GAP + STROKE;
/** The outline the line's centre follows: grown past the window by the gap. */
export const RING_INSET = -(RING_GAP + STROKE / 2);

type PathRef = React.ElementRef<typeof Path>;

export function WindowRing({
  window,
  getTarget,
  color,
  track,
  segments = 1,
}: {
  window: Size;
  /** Latest 0..1 progress. Read every frame; must be a stable function. */
  getTarget: () => number;
  color: string;
  /** The line's bed: the brand tint while all is well, red on a warning. */
  track: string;
  /** Equal parts with a small gap between them. One is an unbroken line. */
  segments?: number;
}): React.ReactElement {
  const refs = useRef<(PathRef | null)[]>([]);
  const targetRef = useRef(0);
  const shownRef = useRef(0);
  const length = useMemo(() => windowOutline(window, RING_INSET).length, [window]);
  const parts = useMemo(() => outlineSegments(window, RING_INSET, segments), [window, segments]);
  const cap = parts.length > 1 ? 'round' : 'butt';

  useEffect(() => {
    let frame = 0;
    let last = Date.now();
    const tick = (): void => {
      const now = Date.now();
      const dt = Math.min((now - last) / 1000, 0.1); // a backgrounded app must not jump
      last = now;
      targetRef.current = advanceTarget(targetRef.current, getTarget());
      shownRef.current = easeToward(shownRef.current, targetRef.current, dt);
      const done = length * shownRef.current;
      parts.forEach((part, i) => {
        const span = part.to - part.from;
        const fill = segmentFill(part, done);
        refs.current[i]?.setNativeProps({
          // An untouched part is pushed a stroke past its own end, so its
          // round cap does not show as a dot.
          strokeDashoffset: fill <= 0 ? span + STROKE : span * (1 - fill),
        });
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getTarget, length, parts]);

  return (
    <Svg
      pointerEvents="none"
      style={{ position: 'absolute', top: -RING_REACH, left: -RING_REACH }}
      width={window.width + RING_REACH * 2}
      height={window.height + RING_REACH * 2}
      viewBox={`${-RING_REACH} ${-RING_REACH} ${window.width + RING_REACH * 2} ${window.height + RING_REACH * 2}`}
    >
      {parts.map((part, i) => (
        <Path key={`t${i}`} d={part.d} fill="none" stroke={track} strokeWidth={STROKE} strokeLinecap={cap} />
      ))}
      {parts.map((part, i) => {
        const span = part.to - part.from;
        return (
          <Path
            key={`p${i}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            d={part.d}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap={cap}
            strokeDasharray={[span, span + STROKE * 2]}
            strokeDashoffset={span + STROKE}
          />
        );
      })}
    </Svg>
  );
}
