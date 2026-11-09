import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';

import { radius, spacing } from '../../config/theme';
import { tapHaptic } from '../../services/haptics';
import { useReduceMotion } from '../StaggerIn';
import { UiText } from '../Typography';
import { SpecimenImage, useSpecimenXml, type DocumentSpecimenSubject } from './DocumentGhost';

// ---------------------------------------------------------------------------
// "Now turn it over."
//
// With the review screen off, nothing stands between the front's shutter and the
// back's camera: the person is still holding the front up, auto-capture sees a
// sharp card and shoots it a second time. So the camera waits here, says what to
// do, and shows the document turning from its front to its back.
//
// The wait is the fix as much as the words are. It runs out by itself so the
// person never has to reach for the screen with their hands full, and the button
// lets anyone quicker move on.
// ---------------------------------------------------------------------------

/** Time to read this, turn the document over and bring it back into frame. */
export const TURN_OVER_MS = 5000;
const FLIP_DELAY_MS = 700;
const FLIP_MS = 800;

/** True while the camera should wait. Starts again each time `needed` turns on. */
export function useTurnOverHold(needed: boolean): { turning: boolean; finish: () => void } {
  const [turning, setTurning] = useState(needed);
  useEffect(() => {
    setTurning(needed);
    if (!needed) return undefined;
    tapHaptic();
    const t = setTimeout(() => setTurning(false), TURN_OVER_MS);
    return () => clearTimeout(t);
  }, [needed]);
  const finish = useCallback(() => setTurning(false), []);
  return { turning, finish };
}

export function TurnOverPrompt({
  x,
  y,
  width,
  height,
  aspect,
  accent,
  subject,
  onDone,
}: {
  /** The guide rect, so the document turns exactly where it has to be held. */
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: number;
  accent: string;
  subject: DocumentSpecimenSubject;
  onDone: () => void;
}): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const flip = useRef(new Animated.Value(0)).current;
  const turned = aspect < 1;
  const sampleAspect = turned ? 1 / aspect : aspect;
  const front = useSpecimenXml(subject, 'front', sampleAspect, accent);
  const back = useSpecimenXml(subject, 'back', sampleAspect, accent);
  const description = `Hold the back of your ${subject.title} inside the frame.`;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Now turn it over. ${description}`);
  }, [description]);

  useEffect(() => {
    if (reduceMotion) {
      flip.setValue(1);
      return undefined;
    }
    const run = Animated.sequence([
      Animated.delay(FLIP_DELAY_MS),
      Animated.timing(flip, {
        toValue: 1,
        duration: FLIP_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    run.start();
    return () => run.stop();
  }, [flip, reduceMotion]);

  // Each face is shown for its half of the turn, swapped when the card is edge-on.
  const face = (from: string, to: string, shown: number[]) => ({
    position: 'absolute' as const,
    left: 0,
    top: 0,
    opacity: flip.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: shown }),
    transform: [
      { perspective: 900 },
      { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) },
    ],
  });

  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(4,2,24,0.72)' }}>
      <View
        style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 0, top: 0 }}
        pointerEvents="none"
      >
        <UiText
          variant="heading3"
          color="#FFFFFF"
          style={{ position: 'absolute', left: 0, right: 0, top: y - 56, textAlign: 'center' }}
        >
          Now turn it over
        </UiText>
      </View>
      <View style={{ position: 'absolute', left: x, top: y, width, height }} pointerEvents="none">
        <Animated.View style={face('0deg', '180deg', [1, 1, 0, 0])}>
          <SpecimenImage xml={front} width={width} height={height} turned={turned} />
        </Animated.View>
        <Animated.View style={face('-180deg', '0deg', [0, 0, 1, 1])}>
          <SpecimenImage xml={back} width={width} height={height} turned={turned} />
        </Animated.View>
      </View>
      <View
        style={{
          position: 'absolute',
          left: spacing.lg,
          right: spacing.lg,
          top: y + height + spacing.lg,
          alignItems: 'center',
        }}
      >
        <UiText variant="body" color="#FFFFFF" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
          {description}
        </UiText>
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="I've turned it over"
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: 48,
            justifyContent: 'center',
            paddingHorizontal: spacing.xl,
            borderRadius: radius.full,
            backgroundColor: '#FFFFFF',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <UiText variant="body" color="#070330" style={{ fontWeight: '700' }}>
            I&apos;ve turned it over
          </UiText>
        </Pressable>
      </View>
    </View>
  );
}
