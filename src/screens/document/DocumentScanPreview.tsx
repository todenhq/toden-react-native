import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../components/runtime';
import { useReduceMotion } from '../../components/StaggerIn';
import {
  SpecimenImage,
  useSpecimenXml,
  type DocumentSpecimenSubject,
} from '../../components/viewfinder/DocumentGhost';
import { documentGuideAspect } from '../../config/idTypes';
import {
  frontShows,
  scanComingIn,
  SCAN_COMING_IN_S,
  scanFrame,
  scanLoopSeconds,
  type ScanFrame,
} from '../../lib/documentScanTimeline';
import { sampledTrack } from '../../lib/previewMotion';

// ---------------------------------------------------------------------------
// A picture of the document scan, for the screen that comes before it: the
// document the person chose, within the camera's frame marks with no
// backdrop of its own (it sits in the screen's tinted box), drawn with the
// same sample the camera's guide shows (lib/documentSpecimen.ts, through
// DocumentGhost), so the two screens show the same thing.
//
// A band of light passes down it as it is read, then a light green cover and
// a tick say it worked. A document with two sides turns over, catching the
// light as it turns, and its back is read the same way; then it turns back
// and starts again. A passport page, or any one-sided document, is read
// again after a rest.
//
// It is a picture: hidden from screen readers (the words beside it say what
// happens next) and, for a person who has asked for less motion, the front of
// the document in its frame, still.
//
// A port of the web SDK's steps/DocumentScanPreview.tsx. The loop is a pure
// timeline (lib/documentScanTimeline.ts) played on the native driver.
// ---------------------------------------------------------------------------

/** The specimen's own corner, as a share of its width (rx 40 on 1000). */
const CORNER = 0.04;
/** Room between the document and the frame marks, either side and above and
 *  below: enough for the marks to sit clear of it, no more. */
const ROOM_X = 20;
const ROOM_Y = 22;
/** The document's width bounds. Between them it takes all the room it is given. */
const MIN_WIDTH = 180;
const MAX_WIDTH = 340;
/** Before it has been measured. */
const FIRST_WIDTH = 270;
/** The frame marks: their side, line and corner, and how far in they sit. */
const MARK = 20;
const MARK_LINE = 2.5;
const MARK_RADIUS = 9;
const MARK_INSET = 6;
/** The band of light: a soft trail above a bright edge. */
const TRAIL = 32;
const EDGE = 2;

export function DocumentScanPreview({
  subject,
  twoSided,
  accent,
}: {
  /** The document the person chose: its ID type, name and country. */
  subject: Omit<DocumentSpecimenSubject, 'side'>;
  /** Its details are on both sides, so it turns over to be read again. */
  twoSided: boolean;
  /** The workflow's colour, which the sample is printed in. */
  accent: string;
}): React.ReactElement {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const aspect = documentGuideAspect(subject.idType);
  // An upright document (a NIN slip) shows the landscape sample turned, as
  // the camera's guide does.
  const turned = aspect < 1;
  const sampleAspect = turned ? 1 / aspect : aspect;
  const full: DocumentSpecimenSubject = { ...subject, side: 'front' };
  const front = useSpecimenXml(full, 'front', sampleAspect, accent);
  const back = useSpecimenXml(full, 'back', sampleAspect, accent);

  // As big as the room allows: the document is what this picture is about.
  const [room, setRoom] = useState<number | null>(null);
  const docWidth = Math.round(
    Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, (room ?? FIRST_WIDTH + ROOM_X * 2) - ROOM_X * 2)),
  );
  const docHeight = Math.round(docWidth / aspect);
  const radius = Math.round(docWidth * CORNER);
  const frameWidth = docWidth + ROOM_X * 2;
  const frameHeight = docHeight + ROOM_Y * 2;
  const docBox: ViewStyle = { position: 'absolute', left: ROOM_X, top: ROOM_Y, width: docWidth, height: docHeight };

  const arrive = useRef(new Animated.Value(0)).current;
  const clock = useRef(new Animated.Value(0)).current;
  const seconds = scanLoopSeconds(twoSided);

  useEffect(() => {
    clock.setValue(0);
    if (reduceMotion) {
      arrive.setValue(SCAN_COMING_IN_S);
      return undefined;
    }
    arrive.setValue(0);
    // Coming in, once; then the read, round and round.
    const run = Animated.sequence([
      Animated.timing(arrive, {
        toValue: SCAN_COMING_IN_S,
        duration: SCAN_COMING_IN_S * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.timing(clock, {
          toValue: seconds,
          duration: seconds * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    ]);
    run.start();
    return () => run.stop();
  }, [reduceMotion, seconds, arrive, clock]);

  // Every moving part as an interpolation of the loop's clock.
  const motion = useMemo(() => {
    const along = (read: (frame: ScanFrame) => number) =>
      clock.interpolate({ ...sampledTrack(seconds, (at) => read(scanFrame(twoSided, at))), extrapolate: 'clamp' });
    const turn = (read: (frame: ScanFrame) => number) =>
      clock.interpolate({
        ...sampledTrack(seconds, (at) => `${read(scanFrame(twoSided, at))}deg`),
        extrapolate: 'clamp',
      });
    const arriving = (read: (look: { opacity: number; scale: number }) => number) =>
      arrive.interpolate({ ...sampledTrack(SCAN_COMING_IN_S, (at) => read(scanComingIn(at))), extrapolate: 'clamp' });
    return {
      stageOpacity: arriving((look) => look.opacity),
      stageScale: arriving((look) => look.scale),
      bandOpacity: along((f) => f.bandOpacity),
      bandY: along((f) => f.bandAt * docHeight - (TRAIL + EDGE)),
      frontAngle: turn((f) => f.angle),
      backAngle: turn((f) => f.angle - 180),
      frontShown: along((f) => (frontShows(f.angle) ? 1 : 0)),
      backShown: along((f) => (frontShows(f.angle) ? 0 : 1)),
      lift: along((f) => 1 + 0.04 * f.lift),
      glintOpacity: along((f) => f.glintOpacity),
      // The web's background position, from 130% to -30%, on a band 2.5 times
      // the document's width.
      glintX: along((f) => -1.5 * docWidth * f.glintAt),
      cover: along((f) => f.pass.cover),
      tickOpacity: along((f) => f.pass.tickOpacity),
      tickScale: along((f) => f.pass.tickScale),
    };
  }, [seconds, twoSided, clock, arrive, docWidth, docHeight]);

  const face = (xml: string, side: 'front' | 'back') => (
    <Animated.View
      style={[
        docBox,
        {
          borderRadius: radius,
          backgroundColor: '#FFFFFF',
          opacity: side === 'front' ? motion.frontShown : motion.backShown,
          transform: [
            { perspective: 900 },
            { rotateY: side === 'front' ? motion.frontAngle : motion.backAngle },
            { scale: motion.lift },
          ],
          shadowColor: '#000000',
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 10 },
          elevation: 6,
        },
      ]}
    >
      {/* The sample is printed a little see-through for the camera; here it
          sits on white, as a document does. */}
      <View style={{ flex: 1, borderRadius: radius, overflow: 'hidden' }}>
        <SpecimenImage xml={xml} width={docWidth} height={docHeight} turned={turned} />
        <Glint width={docWidth} height={docHeight} opacity={motion.glintOpacity} x={motion.glintX} />
      </View>
    </Animated.View>
  );

  const mark = (corner: 'tl' | 'tr' | 'bl' | 'br'): React.ReactElement => {
    const top = corner[0] === 't';
    const left = corner[1] === 'l';
    return (
      <View
        key={corner}
        style={{
          position: 'absolute',
          width: MARK,
          height: MARK,
          [top ? 'top' : 'bottom']: MARK_INSET,
          [left ? 'left' : 'right']: MARK_INSET,
          borderColor: `${colors.primary}B3`, // 70%
          [top ? 'borderTopWidth' : 'borderBottomWidth']: MARK_LINE,
          [left ? 'borderLeftWidth' : 'borderRightWidth']: MARK_LINE,
          [`border${top ? 'Top' : 'Bottom'}${left ? 'Left' : 'Right'}Radius`]: MARK_RADIUS,
        }}
      />
    );
  };

  return (
    <View
      style={{ alignSelf: 'stretch', alignItems: 'center' }}
      onLayout={(e) => {
        const width = Math.round(e.nativeEvent.layout.width);
        if (width !== room) setRoom(width);
      }}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: frameWidth, height: frameHeight }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            inset: 0,
            opacity: motion.stageOpacity,
            transform: [{ scale: motion.stageScale }],
          }}
        >
          {face(front, 'front')}
          {twoSided ? face(back, 'back') : null}
          {/* The band of light that reads it, inside its edges. */}
          <View style={[docBox, { borderRadius: radius, overflow: 'hidden' }]}>
            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: TRAIL + EDGE,
                opacity: motion.bandOpacity,
                transform: [{ translateY: motion.bandY }],
              }}
            >
              <Svg width={docWidth} height={TRAIL}>
                <Defs>
                  <LinearGradient id="toden-scan-trail" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={colors.success} stopOpacity={0} />
                    <Stop offset="1" stopColor={colors.success} stopOpacity={0.28} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={docWidth} height={TRAIL} fill="url(#toden-scan-trail)" />
              </Svg>
              <View
                style={{
                  height: EDGE,
                  backgroundColor: colors.success,
                  // The edge glows on iOS; Android draws only black shadows,
                  // so it has the bright line alone.
                  ...(Platform.OS === 'ios'
                    ? {
                        shadowColor: colors.success,
                        shadowOpacity: 1,
                        shadowRadius: 5,
                        shadowOffset: { width: 0, height: 0 },
                      }
                    : null),
                }}
              />
            </Animated.View>
          </View>
        </Animated.View>
        {/* The camera's frame marks, as the viewfinder draws them. */}
        {mark('tl')}
        {mark('tr')}
        {mark('bl')}
        {mark('br')}
        {/* After each read, as in the liveness check: a light green cover over
            the document, and a tick. */}
        <Animated.View
          style={[docBox, { borderRadius: radius, backgroundColor: `${colors.success}33`, opacity: motion.cover }]}
        />
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.success,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: motion.tickOpacity,
              transform: [{ scale: motion.tickScale }],
              shadowColor: '#000000',
              shadowOpacity: 0.2,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <Svg width={28} height={28} viewBox="0 0 24 24">
              <Path
                d="M5 13l4 4L19 7"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

/** The light a document catches as it turns, on the document so it turns too. */
function Glint({
  width,
  height,
  opacity,
  x,
}: {
  width: number;
  height: number;
  opacity: Animated.AnimatedInterpolation<number>;
  x: Animated.AnimatedInterpolation<number>;
}): React.ReactElement {
  const band = width * 2.5;
  return (
    <Animated.View
      style={{ position: 'absolute', top: 0, left: 0, width: band, height, opacity, transform: [{ translateX: x }] }}
    >
      <Svg width={band} height={height}>
        <Defs>
          <LinearGradient id="toden-scan-glint" x1="0" y1="0.4" x2="1" y2="0.6">
            <Stop offset="0.38" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.6} />
            <Stop offset="0.62" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={band} height={height} fill="url(#toden-scan-glint)" />
      </Svg>
    </Animated.View>
  );
}
