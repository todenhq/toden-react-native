import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { useReduceMotion } from '../../components/StaggerIn';

// ---------------------------------------------------------------------------
// How each part of the carousel arrives when the open group changes. The
// caller keys it, so a part that changes mounts afresh. Forward, the open card
// comes DOWN 16pt from where the next card was; back, it comes up 16pt from
// where the previous card was. The tucked cards (`fadeOnly`) only fade in.
// 300ms ease-out on the native driver. With no direction (the step's first
// render) nothing moves, and reduced motion keeps the fade alone. Mirrors the
// web SDK's GroupStack.
// ---------------------------------------------------------------------------

export type GroupDirection = 'forward' | 'back' | null;

const DURATION_MS = 300;
const OFFSET = 16;

export function GroupEnter({
  direction,
  fadeOnly = false,
  style,
  children,
}: {
  direction: GroupDirection;
  fadeOnly?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}): React.ReactElement {
  const reduceMotion = useReduceMotion();
  // Read once: a part keeps the motion it mounted with.
  const [from] = useState(direction);
  const progress = useRef(new Animated.Value(from === null ? 1 : 0)).current;

  useEffect(() => {
    if (from === null) return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [from, progress]);

  const offset = from === 'back' ? OFFSET : -OFFSET;
  const slides = from !== null && !fadeOnly && !reduceMotion;
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: slides
            ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }]
            : [],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
