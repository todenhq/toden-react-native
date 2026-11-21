import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { useTheme } from '../../components/runtime';
import { useReduceMotion } from '../../components/StaggerIn';
import { windowOutline, type Size } from '../../lib/livenessCutout';
import {
  ATTENTION,
  LIT_STROKE_EXTRA,
  PULSE_GROW,
  PULSE_MS,
  ringClosed,
  SIDE_EASE_MS,
  sideStates,
  SHADOW_LAYERS,
  WAITING,
  type SideState,
} from '../../lib/sideRing';
import { sideSegments, WINDOW_SIDES } from '../../lib/windowSegments';
import type { DirectionChallenge } from '../../liveness/types';
import { RING_INSET, RING_STROKE } from './WindowRing';

// ---------------------------------------------------------------------------
// The line round the camera's window when the test is head directions: four
// parts, one per side. The side the head should go to lights amber, and turns
// green when the person has turned that way. When the run's directions are
// green the line closes into one ring, which pulses once (a run asks two to
// four of the four, so the ring closes when THOSE are done). The rules are in
// lib/sideRing.ts; this is the web SDK's steps/liveness/SideRing.tsx.
//
// With the words above the window and the voice, it is the third way a
// direction is given. Kept plain: one line per side and nothing else round
// it. A soft shadow under the whole line keeps white readable on a pale
// wall. It is drawn in the SVG (SHADOW_LAYERS), not as a view shadow, which
// Android cannot cast from a see-through line.
//
// On a warning the waiting sides go red, as the line of the other tests does.
// ---------------------------------------------------------------------------

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

const LEVEL: Record<SideState, number> = { idle: 0, asked: 1, done: 2 };

/**
 * How far past the window the drawing reaches: the line's centre, then half
 * its thickest state (the asked side with its widest shadow), the shadow's
 * drop and a point to spare. WindowRing's RING_REACH is sized for its own 6
 * line, and an SVG here clips what passes its edge (the web lets it spill), so
 * the asked side was cut off at 13 when it reaches 18.
 */
export const SIDE_REACH =
  -RING_INSET +
  (RING_STROKE + LIT_STROKE_EXTRA + Math.max(...SHADOW_LAYERS.map((l) => l.extra))) / 2 +
  Math.max(...SHADOW_LAYERS.map((l) => l.dy)) +
  1;

function Side({
  d,
  state,
  waiting,
  green,
  reduceMotion,
}: {
  d: string;
  state: SideState;
  waiting: string;
  green: string;
  reduceMotion: boolean;
}): React.ReactElement {
  const level = useRef(new Animated.Value(LEVEL[state])).current;
  useEffect(() => {
    const run = Animated.timing(level, {
      toValue: LEVEL[state],
      duration: reduceMotion ? 0 : SIDE_EASE_MS,
      easing: Easing.out(Easing.ease),
      // Colour and stroke width are not transforms: the JS driver.
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [level, state, reduceMotion]);
  // The line's width, with the shadow layers following it as it thickens.
  const widthPlus = (extra: number) =>
    level.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [RING_STROKE + extra, RING_STROKE + LIT_STROKE_EXTRA + extra, RING_STROKE + extra],
    });
  return (
    <G>
      {SHADOW_LAYERS.map((layer) => (
        <AnimatedPath
          key={layer.extra}
          d={d}
          fill="none"
          strokeLinecap="round"
          stroke={layer.colour}
          strokeWidth={widthPlus(layer.extra)}
          transform={layer.dy ? `translate(0 ${layer.dy})` : undefined}
        />
      ))}
      <AnimatedPath
        d={d}
        fill="none"
        strokeLinecap="round"
        stroke={level.interpolate({ inputRange: [0, 1, 2], outputRange: [waiting, ATTENTION, green] })}
        strokeWidth={widthPlus(0)}
      />
    </G>
  );
}

export function SideRing({
  window,
  asked,
  done,
  directions,
  warning,
}: {
  window: Size;
  /** The direction being asked for now, or null between them. */
  asked: DirectionChallenge | null;
  /** The directions the person has done. */
  done: readonly DirectionChallenge[];
  /** The directions this run asks for. A side no run asks for stays a
   *  waiting line until the whole ring closes green. */
  directions: readonly DirectionChallenge[];
  /** Something is in the way (or the check failed): the waiting sides go red. */
  warning: boolean;
}): React.ReactElement {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const sides = useMemo(() => sideSegments(window, RING_INSET), [window]);
  const whole = useMemo(() => windowOutline(window, RING_INSET).d, [window]);
  const states = sideStates(asked, done);
  const closed = ringClosed(directions, done);
  const waiting = warning ? colors.error : WAITING;

  // The gaps close, and the ring pulses once.
  const shown = useRef(new Animated.Value(closed ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fade = Animated.timing(shown, {
      toValue: closed ? 1 : 0,
      duration: reduceMotion ? 0 : SIDE_EASE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    });
    fade.start();
    if (!closed || reduceMotion) return () => fade.stop();
    pulse.setValue(0);
    const grow = Animated.timing(pulse, {
      toValue: 1,
      duration: PULSE_MS,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });
    grow.start();
    return () => {
      fade.stop();
      grow.stop();
    };
  }, [closed, reduceMotion, shown, pulse]);

  const width = window.width + SIDE_REACH * 2;
  const height = window.height + SIDE_REACH * 2;
  const viewBox = `${-SIDE_REACH} ${-SIDE_REACH} ${width} ${height}`;
  const box = { position: 'absolute' as const, left: -SIDE_REACH, top: -SIDE_REACH, width, height };

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={box}
    >
      <Svg width={width} height={height} viewBox={viewBox}>
        {WINDOW_SIDES.map((side) => (
          <Side
            key={side}
            d={sides[side]}
            state={states[side]}
            waiting={waiting}
            green={colors.success}
            reduceMotion={reduceMotion}
          />
        ))}
        {/* The closed ring, over the gaps, with the same shadow. */}
        <AnimatedG opacity={shown}>
          {SHADOW_LAYERS.map((layer) => (
            <Path
              key={layer.extra}
              d={whole}
              fill="none"
              stroke={layer.colour}
              strokeWidth={RING_STROKE + layer.extra}
              transform={layer.dy ? `translate(0 ${layer.dy})` : undefined}
            />
          ))}
          <Path d={whole} fill="none" stroke={colors.success} strokeWidth={RING_STROKE} />
        </AnimatedG>
      </Svg>
      {/* The pulse: the closed ring grows a little as it fades. */}
      <Animated.View
        style={[
          box,
          { left: 0, top: 0 },
          {
            opacity: pulse.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 0.75, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, PULSE_GROW] }) }],
          },
        ]}
      >
        <Svg width={width} height={height} viewBox={viewBox}>
          <Path d={whole} fill="none" stroke={colors.success} strokeWidth={RING_STROKE} />
        </Svg>
      </Animated.View>
    </View>
  );
}
