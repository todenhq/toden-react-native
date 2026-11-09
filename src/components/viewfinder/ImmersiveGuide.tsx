import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Defs, Mask, Path, Rect } from 'react-native-svg';

import { useTheme } from '../runtime';
import { DocumentGhost, type DocumentSpecimenSubject } from './DocumentGhost';
import type { DocumentFraming } from '../../capture';
import { GUIDE_WIDTH_FRACTION, guideRect } from '../../capture/documentTurn';

// ---------------------------------------------------------------------------
// The full-screen document guide.
//
// A 1:1 port of the Flutter SDK's immersive viewfinder frame: a dimmed
// surround, a rounded window at the document's own aspect, heavy corner
// brackets, and a scan line sweeping down it.
//
// The sweep is not decoration: it is what makes a dim, featureless preview read
// as "actively looking at something". Without it a user holding a passport
// still gets no feedback until the shutter fires.
// ---------------------------------------------------------------------------

/** Share of the screen width the guide occupies (Flutter uses ~88%). */
export { GUIDE_WIDTH_FRACTION };


export function ImmersiveGuide({
  guideAspect,
  primary,
  width,
  height,
  framing,
  subject,
  showSpecimen,
  band,
}: {
  guideAspect: number;
  primary: string;
  width: number;
  height: number;
  /** Auto-capture's verdict for the current frame. */
  framing: DocumentFraming;
  /** The ID being captured, for the sample document. */
  subject: DocumentSpecimenSubject;
  /** Off once the turn-over prompt has already shown this side. */
  showSpecimen: boolean;
  /** For an upright guide: the space it must stay clear of (immersiveBand). */
  band?: { topReserve: number; bottomReserve: number };
}): React.ReactElement {
  const { colors } = useTheme();
  // Each state answers a question the user is actually asking:
  //   searching  → "is the camera even working?"  → neutral, sweeping
  //   wrongShape/adjust → "what do I do?"         → amber, motion stops
  //   holding/ready → "did it see it?"            → green, locked
  //
  // Amber for "I can see something but it isn't right" is distinct from the
  // neutral searching state on purpose: it tells the user to ACT rather than
  // wait, which is the difference between a fixable framing error and a camera
  // that looks frozen.
  const locked = framing === 'holding' || framing === 'ready';
  const needsAction = framing === 'wrongShape' || framing === 'adjust';
  const accent = locked ? colors.success : needsAction ? colors.warning : primary;

  // Only dim once confident: dimming while still searching makes a dark room
  // impossible to aim in.
  const scrim = locked ? 0.45 : needsAction ? 0.25 : 0.18;
  const { x: gx, y: gy, width: gw, height: gh } = guideRect(width, height, guideAspect, band);
  const corner = Math.min(gw, gh) * 0.16;
  const r = 14;

  // The sweep runs the height of the window and repeats. Native driver: it is a
  // pure transform, and a JS-driven animation over a live camera preview
  // stutters exactly when the user is trying to hold still.
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    if (locked) {
      // Freeze once locked: continuing to sweep would imply we are still
      // looking after we have decided.
      sweep.stopAnimation();
      return undefined;
    }
    loop.start();
    return () => loop.stop();
  }, [sweep, locked]);

  return (
    <>
      {/* Under the guide, so the corners sit on the sample's edges. Keyed by side
          so turning the document over shows the other face. */}
      {showSpecimen ? (
      <DocumentGhost
        key={subject.side}
        x={gx}
        y={gy}
        width={gw}
        height={gh}
        aspect={guideAspect}
        accent={primary}
        subject={subject}
        documentFound={framing !== 'none' && framing !== 'wrongShape'}
      />
      ) : null}
      <Svg style={{ position: 'absolute', inset: 0 }} width={width} height={height}>
        <Defs>
          <Mask id="guideWindow">
            <Rect width={width} height={height} fill="white" />
            <Rect x={gx} y={gy} width={gw} height={gh} rx={r} fill="black" />
          </Mask>
        </Defs>

        {/* Everything outside the window is dimmed, so the document reads as
            the lit subject even on a dark desk. */}
        <Rect width={width} height={height} fill={`rgba(0,0,0,${scrim})`} mask="url(#guideWindow)" />

        {/* Faint grid — alignment help that survives a low-contrast page. */}

        <Rect x={gx} y={gy} width={gw} height={gh} rx={r} fill="none" stroke={`${accent}66`} strokeWidth={1.5} />

        {/* Corner brackets — the frame's actual edges, heavy enough to aim by. */}
        {[
          `M${gx},${gy + corner} L${gx},${gy + r} Q${gx},${gy} ${gx + r},${gy} L${gx + corner},${gy}`,
          `M${gx + gw - corner},${gy} L${gx + gw - r},${gy} Q${gx + gw},${gy} ${gx + gw},${gy + r} L${gx + gw},${gy + corner}`,
          `M${gx + gw},${gy + gh - corner} L${gx + gw},${gy + gh - r} Q${gx + gw},${gy + gh} ${gx + gw - r},${gy + gh} L${gx + gw - corner},${gy + gh}`,
          `M${gx + corner},${gy + gh} L${gx + r},${gy + gh} Q${gx},${gy + gh} ${gx},${gy + gh - r} L${gx},${gy + gh - corner}`,
        ].map((d, i) => (
          <Path key={i} d={d} stroke={accent} strokeWidth={4} fill="none" strokeLinecap="round" />
        ))}
      </Svg>

      {/* Scan line, above the SVG so it can be transform-animated natively. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: gx,
          top: gy,
          width: gw,
          height: 2,
          backgroundColor: accent,
          shadowColor: accent,
          shadowOpacity: 0.9,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
          transform: [
            { translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, gh - 2] }) },
          ],
        }}
      />
    </>
  );
}
