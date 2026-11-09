import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { useTheme } from '../../components/runtime';
import { useReduceMotion } from '../../components/StaggerIn';
import { UiText } from '../../components/Typography';
import { Icon } from '../../components/Icon';
import { Pill } from './ImmersiveSurfaces';
import {
  PILL_FADE_BEZIER,
  PILL_SIZE_BEZIER,
  pillContentWidth,
  pillMotionMs,
} from './instructionPillMotion';

// ---------------------------------------------------------------------------
// The instruction over the full-screen camera.
//
// Three things the plain line in the sheet did not need:
//
//  - It is read out. The person is looking at their own face, and somebody
//    using a screen reader cannot see the words at all, so every change is
//    announced: a live region on Android, an announcement on iOS (which has
//    no live regions).
//  - A warning carries a mark as well as its red, and a finished step a tick
//    as well as its green: the colour is never the only signal.
//  - The words change in place. The pill keeps its position and eases to its
//    new width while one line fades into the next (instructionPillMotion.ts
//    has the timings, which are Flutter's).
//
// The width: an invisible copy of the pill lays the new line out at its
// natural width, and the visible pill's content box animates to it. The line
// itself sits in a box of its final width, centred and clipped, so the words
// never rewrap mid-change. Width cannot run on the native driver, so the box
// is JS-driven; the crossfade is on the native driver.
// ---------------------------------------------------------------------------

export type InstructionTone = 'prompt' | 'warning' | 'done';

type Line = { key: string; text: string; tone: InstructionTone; leading?: React.ReactNode };

type Swap = {
  /** The line last rendered: the one to fade out at the next change. */
  line: Line | null;
  /** The line fading out, with the width it was measured at. */
  outgoing: (Line & { width: number | null }) | null;
  /** Bumps on every change, so a stale fade's end cannot clear a newer one. */
  seq: number;
  fadeIn: Animated.Value;
  fadeOut: Animated.Value;
};

/** The content box's width while a new line is not yet measured: more than
 *  any line needs, so nothing wraps; the pill's own box clips it. */
const UNMEASURED_ROOM = 4096;

const sizeEasing = Easing.bezier(...PILL_SIZE_BEZIER);
const fadeEasing = Easing.bezier(...PILL_FADE_BEZIER);

export function InstructionPill({
  text,
  tone = 'prompt',
  leading,
}: {
  text: string;
  tone?: InstructionTone;
  /** The gesture's picture, on a phone too short to show it above the pill.
   *  Shown for a prompt only: a warning's mark takes its place. */
  leading?: React.ReactNode;
}): React.ReactElement | null {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const visible = text.trim().length > 0;
  const key = `${tone}:${leading != null}:${text}`;
  const shown = useRef(text);

  // The measured natural width of each line, by key.
  const [measured, setMeasured] = useState<{ key: string; width: number } | null>(null);

  const [swap, setSwap] = useState<Swap>(() => ({
    line: visible ? { key, text, tone, leading } : null,
    outgoing: null,
    seq: 0,
    fadeIn: new Animated.Value(1),
    fadeOut: new Animated.Value(0),
  }));

  // A new line: decided while rendering, so its first frame is already at
  // the start of the fade rather than one frame of it at full strength.
  const lineKey = visible ? key : null;
  if ((swap.line?.key ?? null) !== lineKey) {
    const before = swap.line;
    const animate = !reduceMotion && before != null && visible;
    setSwap({
      line: visible ? { key, text, tone, leading } : null,
      outgoing: animate
        ? { ...before, width: measured?.key === before.key ? measured.width : null }
        : null,
      seq: swap.seq + 1,
      fadeIn: new Animated.Value(animate ? 0 : 1),
      fadeOut: new Animated.Value(animate ? 1 : 0),
    });
  }

  useEffect(() => {
    if (shown.current === text) return;
    shown.current = text;
    if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);

  // The crossfade.
  useEffect(() => {
    if (!swap.outgoing) return;
    const { seq } = swap;
    const fade = (value: Animated.Value, toValue: number) =>
      Animated.timing(value, {
        toValue,
        duration: pillMotionMs(false),
        easing: fadeEasing,
        useNativeDriver: true,
      });
    const both = Animated.parallel([fade(swap.fadeIn, 1), fade(swap.fadeOut, 0)]);
    both.start(({ finished }) => {
      if (finished) setSwap((s) => (s.seq === seq ? { ...s, outgoing: null } : s));
    });
    return () => both.stop();
  }, [swap]);

  // The width.
  const incomingWidth = measured?.key === key ? measured.width : null;
  const boxWidth = useRef(new Animated.Value(0)).current;
  const [sized, setSized] = useState(false);
  const target = visible ? pillContentWidth(incomingWidth, swap.outgoing?.width) : null;

  useEffect(() => {
    if (target == null) {
      // Gone: it comes back at its own size, not easing from the last one.
      if (!visible) setSized(false);
      return;
    }
    if (!sized || reduceMotion) {
      boxWidth.stopAnimation();
      boxWidth.setValue(target);
      if (!sized) setSized(true);
      return;
    }
    const grow = Animated.timing(boxWidth, {
      toValue: target,
      duration: pillMotionMs(false),
      easing: sizeEasing,
      useNativeDriver: false,
    });
    grow.start();
    return () => grow.stop();
  }, [target, sized, reduceMotion, visible, boxWidth]);

  if (!visible) return null;

  const onMeasure = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setMeasured((m) => (m?.key === key && m.width === width ? m : { key, width }));
  };

  const row = (line: Line, onLayout?: (e: LayoutChangeEvent) => void) => {
    const mark =
      line.tone === 'warning' ? (
        <Icon name="alert" size={20} color={colors.error} />
      ) : line.tone === 'done' ? (
        <Icon name="circle-check" size={20} color={colors.success} />
      ) : (
        (line.leading ?? null)
      );
    return (
      <View
        onLayout={onLayout}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 1,
        }}
      >
        {mark ? <View style={{ marginRight: 8 }}>{mark}</View> : null}
        {/* The green of a finished step does not reach 4.5:1 on a light
            surface, so the tick carries it and the words stay the text
            colour. */}
        <UiText
          variant="heading3"
          color={line.tone === 'warning' ? colors.error : colors.textDark}
          style={{ textAlign: 'center', flexShrink: 1 }}
        >
          {line.text}
        </UiText>
      </View>
    );
  };

  const current: Line = { key, text, tone, leading };
  // Once sized, the box keeps its animated width. Until the new line is
  // measured (a frame or so) its words get all the room they want, centred
  // and clipped, rather than wrapping at the old line's width or the pill
  // snapping to its natural size and back.
  const box = sized;
  const content = target ?? UNMEASURED_ROOM;

  return (
    // Stretched to the room it is given, not shrunk to the pill: the parent
    // centres its children, and a root as wide as the pill would hold the
    // measuring copy to the OLD line's width, so a longer line measured
    // wrapped and stayed wrapped.
    <View style={{ alignSelf: 'stretch', alignItems: 'center' }}>
      {/* The measuring copy: the same pill under the same max width, out of
          the layout and unseen and unread, so the new line's natural width is
          known before the visible pill moves to it. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', opacity: 0 }}
      >
        <Pill>{row(current, onMeasure)}</Pill>
      </View>
      <Pill>
        <Animated.View
          accessible
          accessibilityRole="text"
          accessibilityLabel={text}
          accessibilityLiveRegion="polite"
          style={[
            { flexShrink: 1, alignItems: 'center', justifyContent: 'center' },
            box ? { width: boxWidth, overflow: 'hidden' } : null,
          ]}
        >
          <View
            style={box ? { width: content, flexShrink: 0, justifyContent: 'center' } : { flexShrink: 1 }}
          >
            <Animated.View key={key} style={{ opacity: swap.fadeIn, flexShrink: 1 }}>
              {row(current)}
            </Animated.View>
            {swap.outgoing ? (
              <Animated.View
                key={swap.outgoing.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  justifyContent: 'center',
                  opacity: swap.fadeOut,
                }}
              >
                {row(swap.outgoing)}
              </Animated.View>
            ) : null}
          </View>
        </Animated.View>
      </Pill>
    </View>
  );
}
