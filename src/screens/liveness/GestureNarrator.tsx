import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useReduceMotion } from '../../components/StaggerIn';
import type { Size } from '../../lib/livenessCutout';
import { NARRATOR_STROKE, narratorPaths } from '../../liveness/narratorGlyph';
import {
  NARRATOR_REST,
  NARRATOR_SECONDS,
  narratorPose,
  narratorStillPose,
  type NarratorGesture,
  type NarratorPose,
} from '../../liveness/narratorPose';

// ---------------------------------------------------------------------------
// The gesture narrator: a face icon, in the manner of a phone's face unlock,
// that pops up in the camera's window, acts out the gesture being asked for
// once, and goes. It works like a hint in a game: quick to come, quicker to
// go, so it is out of the way before the person moves.
//
// It comes back to show again only to someone who is not responding: nothing
// done with their face for a while (liveness/responseWatch.ts). A person who
// is trying, and has not got it yet, is left to it. It is not there while
// they are being asked to move into place, for the flash or the hold, or once
// the gesture has landed (liveness/narratorPose.ts narratedGesture).
//
// The words above the window say the same, so it is hidden from screen
// readers. With less motion asked for it does not move: it shows the pose
// that says the gesture, then fades.
//
// Apple Face ID style (liveness/narratorGlyph.ts): a round head that turns
// as it turns, with eyes and nose that move. Flat white lines, with no edge
// or shadow round them: white to match the line round the window, where white
// is what is still to do; solid where that line is at 70%, because this sits
// ON the face and 70% white washes out over a lit forehead. It was the
// workflow's colour until the web changed it (2026-11-18).
//
// A port of the web SDK's steps/liveness/GestureNarrator.tsx: the timings are
// the web's. The pose is written straight to the paths each frame
// (setNativeProps, as WindowRing does), never through a render.
// ---------------------------------------------------------------------------

type Turn = 'showing' | 'gone';

/** How long the person may do nothing before it shows them again. */
const PATIENCE_MS = 5000;
/** How often it looks to see whether they have gone quiet. */
const LOOK_EVERY_MS = 400;
/** How long the still pose stays, with less motion asked for. */
const STILL_MS = 2500;
/** Its side, as a share of the window's width. */
const SIZE = 0.6;
/** Where it comes from and goes back to. */
const AWAY_SCALE = 0.86;
/** The face's lines: white, the colour of the line round the window. */
export const NARRATOR_COLOUR = '#ffffff';

type PathRef = React.ElementRef<typeof Path>;

export function GestureNarrator({
  gesture,
  respondedAtRef,
  window,
  showAgain = 0,
}: {
  /** The gesture to act out, or null for it to go. */
  gesture: NarratorGesture | null;
  /** When the person last did anything with their face (Date.now(), 0 for never). */
  respondedAtRef: { readonly current: number };
  /** The camera's window, which it is sized to and centred in. */
  window: Size;
  /** Changes each time it should act the gesture out again now, without
   *  waiting for the person to go quiet: they went the wrong way. */
  showAgain?: number;
}): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const [turn, setTurn] = useState<Turn>('showing');
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(AWAY_SCALE)).current;
  const eyeRefs = useRef<(PathRef | null)[]>([]);
  const lidRefs = useRef<(PathRef | null)[]>([]);
  const noseRef = useRef<PathRef | null>(null);
  const mouthRef = useRef<PathRef | null>(null);
  const headRef = useRef<PathRef | null>(null);

  // Every gesture is shown first.
  useEffect(() => {
    if (gesture) setTurn('showing');
  }, [gesture]);

  // Asked to show again: back at once.
  const shownFor = useRef(showAgain);
  useEffect(() => {
    if (showAgain === shownFor.current) return;
    shownFor.current = showAgain;
    if (gesture) setTurn('showing');
  }, [showAgain, gesture]);

  // One pass, then it goes.
  useEffect(() => {
    if (!gesture || turn !== 'showing') return undefined;
    const ms = reduceMotion ? STILL_MS : NARRATOR_SECONDS[gesture] * 1000;
    const timer = setTimeout(() => setTurn('gone'), ms);
    return () => clearTimeout(timer);
  }, [gesture, turn, reduceMotion]);

  // Gone for as long as the person is doing something. Once they have gone
  // quiet, from when it left or since their last move, it comes back.
  useEffect(() => {
    if (!gesture || turn !== 'gone') return undefined;
    const left = Date.now();
    const looking = setInterval(() => {
      const quietSince = Math.max(left, respondedAtRef.current);
      if (Date.now() - quietSince >= PATIENCE_MS) setTurn('showing');
    }, LOOK_EVERY_MS);
    return () => clearInterval(looking);
  }, [gesture, turn, respondedAtRef]);

  const shown = Boolean(gesture) && turn === 'showing';

  // Quick to come (a pop with a slight overshoot), quicker to go.
  useEffect(() => {
    let run: Animated.CompositeAnimation;
    if (reduceMotion) {
      scale.setValue(1);
      run = Animated.timing(opacity, {
        toValue: shown ? 1 : 0,
        duration: 260,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
    } else if (shown) {
      run = Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 380,
          easing: Easing.bezier(0.34, 1.4, 0.64, 1),
          useNativeDriver: true,
        }),
      ]);
    } else {
      run = Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, {
          toValue: AWAY_SCALE,
          duration: 180,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]);
    }
    run.start();
    return () => run.stop();
  }, [shown, reduceMotion, opacity, scale]);

  // The pose, one pass of it. The last pose stays while it goes.
  useEffect(() => {
    const draw = (pose: NarratorPose): void => {
      const paths = narratorPaths(pose);
      headRef.current?.setNativeProps({ d: paths.head });
      paths.eyes.forEach((d, i) => eyeRefs.current[i]?.setNativeProps({ d }));
      paths.lids.forEach((d, i) => lidRefs.current[i]?.setNativeProps({ d, opacity: paths.lidOpacity }));
      noseRef.current?.setNativeProps({ d: paths.nose });
      mouthRef.current?.setNativeProps({ d: paths.mouth });
    };
    if (!gesture) return undefined;
    if (reduceMotion) {
      draw(narratorStillPose(gesture));
      return undefined;
    }
    if (turn !== 'showing') return undefined;
    draw(NARRATOR_REST);
    const started = Date.now();
    const once = NARRATOR_SECONDS[gesture];
    let frame = requestAnimationFrame(function tick() {
      const at = Math.min((Date.now() - started) / 1000, once);
      draw(narratorPose(gesture, at));
      if (at < once) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [gesture, turn, reduceMotion]);

  // What the first frame draws; every later pose is written to the paths.
  const first = useMemo(
    () => narratorPaths(reduceMotion && gesture ? narratorStillPose(gesture) : NARRATOR_REST),
    [reduceMotion, gesture],
  );
  const side = Math.round(window.width * SIZE);
  const stroke = {
    fill: 'none',
    stroke: NARRATOR_COLOUR,
    strokeWidth: NARRATOR_STROKE,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: (window.width - side) / 2,
        top: (window.height - side) / 2,
        width: side,
        height: side,
        opacity,
        transform: [{ scale }],
      }}
    >
      <Svg width={side} height={side} viewBox="0 0 100 100">
        <Path ref={headRef} d={first.head} {...stroke} />
        {first.eyes.map((d, i) => (
          <Path
            key={`eye${i}`}
            ref={(el) => {
              eyeRefs.current[i] = el;
            }}
            d={d}
            {...stroke}
          />
        ))}
        {first.lids.map((d, i) => (
          <Path
            key={`lid${i}`}
            ref={(el) => {
              lidRefs.current[i] = el;
            }}
            d={d}
            opacity={first.lidOpacity}
            {...stroke}
          />
        ))}
        <Path ref={noseRef} d={first.nose} {...stroke} />
        <Path ref={mouthRef} d={first.mouth} {...stroke} />
      </Svg>
    </Animated.View>
  );
}
