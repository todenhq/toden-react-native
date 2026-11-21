import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop, SvgXml } from 'react-native-svg';

import { useTheme } from '../../components/runtime';
import { useReduceMotion } from '../../components/StaggerIn';
import { CUTOUT_ASPECT } from '../../lib/livenessCutout';
import { sampledTrack } from '../../lib/previewMotion';
import {
  comingIn,
  COMING_IN_S,
  NOD_SLIDE,
  PREVIEW_GESTURES,
  previewRound,
  roundPass,
  roundPose,
  roundProgress,
  TURN_SLIDE,
  type PreviewPose,
} from '../../liveness/gesturePreviewTimeline';
import { TOON_PARTS, TOON_VIEWBOX } from '../../liveness/toonFace';
import { cameraRoom, paintToon, toonShades } from '../../liveness/toonShades';
import { StyleAbsFill } from './constants';
import { WindowRing } from './WindowRing';

// ---------------------------------------------------------------------------
// A small picture of the liveness camera, for the screen that comes before
// it: the camera's own window with its line round it, and in it a cartoon
// person doing what the camera may ask for (turn, nod, blink, smile). The line
// is cut into four parts and one fills green with each gesture, as it does in
// the camera. Each gesture ends as it does in the camera, too: the window
// takes a light green cover and a tick pops up at once, then the next one
// starts. When the four have joined, it all starts again. A passive check
// shows the person holding still while the line closes.
//
// The person comes in once, from a little way back, a touch too close, and
// settles, as someone finding their distance does. The turn and the nod are
// drawn by sliding the face across the head (the hair less, the outline
// narrowing a touch), which reads as the head turning; the blink and the
// smile are the character's own drawings.
//
// It is painted in shades of the workflow's own colour, skin, hair and
// clothes alike, so it has no skin colour and stands for anyone
// (liveness/toonShades.ts).
//
// It is a picture: hidden from screen readers (the words beside it say what
// happens next) and still, at rest, for a person who has asked for less
// motion. The character is "Toon Head" by Johan Melin, CC BY 4.0, with short
// hair of our own (liveness/toonFace.ts).
//
// A port of the web SDK's steps/liveness/GesturePreview.tsx. The loop is a
// pure timeline (liveness/gesturePreviewTimeline.ts) played on the native
// driver, one round per animation, so the window's line (read on the JS
// clock) starts each round in step with the person.
// ---------------------------------------------------------------------------

const LINE_PARTS = 4;
/** The drawing's own width. */
const UNITS = 768;

type Layer = keyof typeof TOON_PARTS;

export function GesturePreview({
  passive = false,
  width = 176,
}: {
  /** A passive check: no gestures; the person holds still while the line closes. */
  passive?: boolean;
  /** The width of the window. */
  width?: number;
}): React.ReactElement {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const height = Math.round(width * CUTOUT_ASPECT);
  const window = useMemo(() => ({ width, height }), [width, height]);
  // Wider than the window and dropped a little, so the face fills it and the
  // shoulders run off its bottom edge, as in the camera.
  const drawing = Math.round(width * 1.36);
  const k = drawing / UNITS;

  const round = useMemo(() => previewRound(passive ? [] : PREVIEW_GESTURES), [passive]);
  const [rounds, setRounds] = useState(0);
  const roundStartRef = useRef<number | null>(null);
  const arrive = useRef(new Animated.Value(0)).current;
  const clock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    roundStartRef.current = null;
    clock.setValue(0);
    if (reduceMotion) {
      arrive.setValue(COMING_IN_S);
      return undefined;
    }
    let running: Animated.CompositeAnimation | null = null;
    let stopped = false;
    const playRound = (): void => {
      if (stopped) return;
      roundStartRef.current = Date.now();
      clock.setValue(0);
      running = Animated.timing(clock, {
        toValue: round.seconds,
        duration: round.seconds * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      running.start(({ finished }) => {
        if (!finished || stopped) return;
        // The line goes back to empty for the next round (WindowRing is
        // keyed on the count: its progress only ever moves forward).
        setRounds((count) => count + 1);
        playRound();
      });
    };
    // Coming in, once; then the gestures, round and round.
    arrive.setValue(0);
    running = Animated.timing(arrive, {
      toValue: COMING_IN_S,
      duration: COMING_IN_S * 1000,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    running.start(({ finished }) => {
      if (finished) playRound();
    });
    return () => {
      stopped = true;
      running?.stop();
      roundStartRef.current = null;
    };
  }, [round, reduceMotion, arrive, clock]);

  const getTarget = useCallback((): number => {
    const start = roundStartRef.current;
    return start == null ? 0 : roundProgress(round, (Date.now() - start) / 1000);
  }, [round]);

  // Every moving part as an interpolation of the round's clock.
  const motion = useMemo(() => {
    const along = (value: (at: number) => number) =>
      clock.interpolate({ ...sampledTrack(round.seconds, value), extrapolate: 'clamp' });
    const pose = (read: (p: PreviewPose) => number) => along((at) => read(roundPose(round, at)));
    const shown = (on: (p: PreviewPose) => boolean) => pose((p) => (on(p) ? 1 : 0));
    const arriving = (read: (look: { opacity: number; scale: number }) => number) =>
      arrive.interpolate({ ...sampledTrack(COMING_IN_S, (at) => read(comingIn(at))), extrapolate: 'clamp' });
    return {
      stageOpacity: arriving((look) => look.opacity),
      stageScale: arriving((look) => look.scale),
      faceX: pose((p) => p.across * TURN_SLIDE * k),
      faceY: pose((p) => p.down * NOD_SLIDE * k),
      hairX: pose((p) => p.across * TURN_SLIDE * 0.35 * k),
      hairY: pose((p) => p.down * NOD_SLIDE * 0.4 * k),
      // The back of the head goes the other way, which is what makes it turn.
      hairBehindX: pose((p) => -p.across * TURN_SLIDE * 0.2 * k),
      hairBehindY: pose((p) => p.down * NOD_SLIDE * 0.1 * k),
      // The head narrows a touch as it turns away, and drops a little in a nod.
      headScale: pose((p) => 1 - 0.035 * Math.abs(p.across)),
      headY: pose((p) => p.down * NOD_SLIDE * 0.15 * k),
      eyesOpen: shown((p) => !p.shut && !p.smile),
      eyesShut: shown((p) => p.shut),
      eyesHappy: shown((p) => p.smile),
      mouthRest: shown((p) => !p.smile),
      mouthSmile: shown((p) => p.smile),
      cover: along((at) => roundPass(round, at).cover),
      tickOpacity: along((at) => roundPass(round, at).tickOpacity),
      tickScale: along((at) => roundPass(round, at).tickScale),
    };
  }, [round, clock, arrive, k]);

  const parts = useMemo(() => {
    const shades = toonShades(colors.primary);
    const xml = (layer: Layer): string =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${TOON_VIEWBOX}">${paintToon(TOON_PARTS[layer], shades)}</svg>`;
    return {
      back: xml('back'),
      hairBehind: xml('hairBehind'),
      head: xml('head'),
      brows: xml('brows'),
      eyesOpen: xml('eyesOpen'),
      eyesShut: xml('eyesShut'),
      eyesHappy: xml('eyesHappy'),
      mouthRest: xml('mouthRest'),
      mouthSmile: xml('mouthSmile'),
      hair: xml('hair'),
    };
  }, [colors.primary]);
  const room = useMemo(() => cameraRoom(colors.primary), [colors.primary]);

  const layer = (xml: string, style?: Animated.WithAnimatedValue<object>) => (
    <Animated.View style={[StyleAbsFill, style]}>
      <SvgXml xml={xml} width={drawing} height={drawing} />
    </Animated.View>
  );

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height }}
    >
      <View style={[StyleAbsFill, { borderRadius: width / 2, overflow: 'hidden' }]}>
        {/* The room behind the window stands in for the camera. */}
        <Svg style={StyleAbsFill} width={width} height={height}>
          <Defs>
            <LinearGradient id="toden-camera-room" x1="0.33" y1="0.03" x2="0.67" y2="0.97">
              <Stop offset="0" stopColor={room.from} />
              <Stop offset="1" stopColor={room.to} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#toden-camera-room)" />
        </Svg>
        <Animated.View
          style={[StyleAbsFill, { opacity: motion.stageOpacity, transform: [{ scale: motion.stageScale }] }]}
        >
          <View
            style={{
              position: 'absolute',
              left: (width - drawing) / 2,
              top: (height - drawing) / 2 + drawing * 0.1,
              width: drawing,
              height: drawing,
            }}
          >
            {layer(parts.back)}
            {layer(parts.hairBehind, {
              transform: [{ translateX: motion.hairBehindX }, { translateY: motion.hairBehindY }],
            })}
            {layer(parts.head, { transform: [{ translateY: motion.headY }, { scaleX: motion.headScale }] })}
            <Animated.View
              style={[StyleAbsFill, { transform: [{ translateX: motion.faceX }, { translateY: motion.faceY }] }]}
            >
              {layer(parts.mouthRest, { opacity: motion.mouthRest })}
              {layer(parts.mouthSmile, { opacity: motion.mouthSmile })}
              {layer(parts.eyesOpen, { opacity: motion.eyesOpen })}
              {layer(parts.eyesShut, { opacity: motion.eyesShut })}
              {layer(parts.eyesHappy, { opacity: motion.eyesHappy })}
              {layer(parts.brows)}
            </Animated.View>
            {layer(parts.hair, { transform: [{ translateX: motion.hairX }, { translateY: motion.hairY }] })}
          </View>
        </Animated.View>
        {/* After each gesture, as in the camera: a light green cover over the
            window, and the tick, up at once. */}
        <Animated.View style={[StyleAbsFill, { backgroundColor: `${colors.success}33`, opacity: motion.cover }]} />
        <View style={[StyleAbsFill, { alignItems: 'center', justifyContent: 'center' }]}>
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
      <WindowRing
        key={rounds}
        window={window}
        getTarget={getTarget}
        color={colors.success}
        track={`${colors.primary}8C`}
        segments={LINE_PARTS}
      />
    </View>
  );
}
