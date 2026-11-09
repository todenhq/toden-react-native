import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { documentSpecimen, specimenKind } from '../../lib/documentSpecimen';

// ---------------------------------------------------------------------------
// The sample document in the capture guide.
//
// Shown for a few seconds when the camera opens, so the person sees what to hold
// up and which way round: a passport with PASSPORT written on it and its
// machine-readable lines inside the frame, a licence with its categories, the
// back of a card with what the back carries. The commonest passport mistake is
// cropping those lines off the bottom edge, which auto-capture then refuses.
//
// It sits exactly on the guide, under the corners, so the two cannot disagree
// about where the document goes. The drawing itself is lib/documentSpecimen.ts.
// ---------------------------------------------------------------------------

/** When it starts to leave if nothing is framed: long enough to read it, find the
 *  document and bring it up to the camera. */
const SPECIMEN_MS = 5000;
/** A document in frame brings that forward, but never before it has been read. */
const MIN_SPECIMEN_MS = 2000;
/** Slow on purpose, so it melts away over the camera rather than blinking off
 *  while the person is still lining their document up with it. */
const FADE_OUT_MS = 1600;
/** See-through, so the sample guides the person without hiding the camera:
 *  they have to see their own document arrive behind it. */
const SPECIMEN_OPACITY = 0.6;

const SANS = Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' });
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** What to draw: the ID in hand, and the side the camera is asking for. */
export interface DocumentSpecimenSubject {
  idType: string | null;
  title: string;
  country: string | null;
  side: 'front' | 'back';
}

/** The drawing of one face of the document, ready for SvgXml. */
export function useSpecimenXml(
  subject: DocumentSpecimenSubject,
  side: 'front' | 'back',
  aspect: number,
  accent: string,
): string {
  return useMemo(
    () =>
      documentSpecimen({
        kind: specimenKind(subject.idType),
        title: subject.title,
        country: subject.country,
        side,
        aspect,
        accent,
        sans: SANS,
        mono: MONO,
      }),
    [subject.idType, subject.title, subject.country, side, aspect, accent],
  );
}

export function DocumentGhost({
  x,
  y,
  width,
  height,
  aspect,
  accent,
  subject,
  documentFound,
}: {
  /** The guide rect, in the same coordinates the overlay uses. */
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: number;
  accent: string;
  subject: DocumentSpecimenSubject;
  /** Ends it early, after MIN_SPECIMEN_MS: once a document is framed the guidance
   *  has done its job and would only sit on top of the thing being captured. */
  documentFound: boolean;
}): React.ReactElement | null {
  const opacity = useRef(new Animated.Value(0)).current;

  // An upright guide (a turned NIN slip) shows the landscape sample turned.
  const turned = aspect < 1;
  const xml = useSpecimenXml(subject, subject.side, turned ? 1 / aspect : aspect, accent);
  const shownAt = useRef(Date.now());
  const fading = useRef(false);

  // Both ways out share this, and only the first runs: a second start would
  // restart the fade from wherever the first had got to.
  const fadeOut = useCallback(() => {
    if (fading.current) return;
    fading.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: SPECIMEN_OPACITY,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
    const t = setTimeout(fadeOut, SPECIMEN_MS);
    return () => clearTimeout(t);
  }, [opacity, fadeOut]);

  useEffect(() => {
    if (!documentFound) return undefined;
    const wait = Math.max(0, MIN_SPECIMEN_MS - (Date.now() - shownAt.current));
    const t = setTimeout(fadeOut, wait);
    return () => clearTimeout(t);
  }, [documentFound, fadeOut]);

  if (width <= 0 || height <= 0) return null;

  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x, top: y, width, height, opacity }}>
      <SpecimenImage xml={xml} width={width} height={height} turned={turned} />
    </Animated.View>
  );
}

/**
 * The sample drawing in a `width` × `height` box. Turned, the landscape drawing
 * is laid out sideways and rotated a quarter clockwise, so its top faces the
 * right of the screen (documentTurn's default direction).
 */
export function SpecimenImage({
  xml,
  width,
  height,
  turned,
}: {
  xml: string;
  width: number;
  height: number;
  turned: boolean;
}): React.ReactElement {
  if (!turned) return <SvgXml xml={xml} width={width} height={height} preserveAspectRatio="none" />;
  return (
    <View
      style={{
        position: 'absolute',
        width: height,
        height: width,
        left: (width - height) / 2,
        top: (height - width) / 2,
        transform: [{ rotate: '90deg' }],
      }}
    >
      <SvgXml xml={xml} width={height} height={width} preserveAspectRatio="none" />
    </View>
  );
}
