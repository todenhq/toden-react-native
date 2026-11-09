import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Icon } from '../components/Icon';
import { useTheme } from '../components/runtime';
import { useReduceMotion } from '../components/StaggerIn';
import { radius } from '../config/theme';

// The illustration on the key-people reading screen (KeyPeopleReadingScreen):
// people lifted off a page as a beam reads it. Mirrors the web SDK's
// PeopleLiftedOffThePage; the shares and keyframes match its globals.css.

/** One sweep of the beam; each person lifts off when the beam reaches their row. */
const CYCLE_MS = 3600;
const PAGE_HEIGHT = 208;

/** The rows that name a person: their top on the page and when the beam reaches them. */
const PEOPLE = [
  { top: 68, at: 0.37, name: '62%' as const, role: '38%' as const },
  { top: 120, at: 0.58, name: '74%' as const, role: '46%' as const },
  { top: 172, at: 0.79, name: '56%' as const, role: '32%' as const },
];
const FILLER: Array<{ top: number; width: `${number}%` }> = (
  [[36, 70], [48, 86], [92, 64], [104, 80], [144, 58], [156, 76], [196, 66]] as const
).map(([top, w]) => ({ top, width: `${w}%` as const }));

/** A looping 0..1 clock, started after `delay` of the cycle. Still under reduced motion. */
function useCycle(running: boolean, delayShare: number): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!running) {
      value.setValue(0.5);
      return;
    }
    value.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(delayShare * CYCLE_MS),
      Animated.loop(Animated.timing(value, { toValue: 1, duration: CYCLE_MS, easing: Easing.linear, useNativeDriver: true })),
    ]);
    anim.start();
    return () => anim.stop();
  }, [running, delayShare, value]);
  return value;
}

/**
 * A page being read: a beam sweeps down it, and as it reaches each person the
 * line lights up and a card for them lifts off the page into the stack beside
 * it. Finished, the cards settle with a tick, one per person found (up to
 * three). Decorative, so hidden from screen readers. Under reduced motion it
 * holds still with the people shown.
 */
export function PeopleLiftedOffThePage({ found }: { found: number | null }): React.ReactElement {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const done = found != null;
  const running = !reduce && !done;
  const beam = useCycle(running, 0);
  const shown = done ? PEOPLE.slice(0, Math.max(1, Math.min(found, PEOPLE.length))) : PEOPLE;

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 288, height: 224 }}>
      <View
        style={{
          position: 'absolute',
          left: 8,
          top: 8,
          width: 144,
          height: PAGE_HEIGHT,
          overflow: 'hidden',
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 5,
        }}
      >
        <View style={{ marginHorizontal: 16, marginTop: 16, height: 10, width: '50%', borderRadius: 5, backgroundColor: colors.primary, opacity: 0.35 }} />
        {FILLER.map((line) => (
          <View
            key={line.top}
            style={{ position: 'absolute', left: 16, top: line.top, height: 6, width: line.width, borderRadius: 3, backgroundColor: colors.textSecondary, opacity: 0.2 }}
          />
        ))}
        {PEOPLE.map((p) => (
          <PersonRow key={p.top} top={p.top} name={p.name} running={running} at={p.at} />
        ))}
        {running ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: 40,
              opacity: beam.interpolate({ inputRange: [0, 0.06, 0.92, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateY: beam.interpolate({ inputRange: [0, 1], outputRange: [-40, PAGE_HEIGHT] }) }],
            }}
          >
            <View style={{ flex: 1, backgroundColor: colors.primary, opacity: 0.14 }} />
            <View style={{ position: 'absolute', left: 0, right: 0, top: 19, height: 2, backgroundColor: colors.primary, opacity: 0.75 }} />
          </Animated.View>
        ) : null}
      </View>
      {shown.map((p) => (
        <PersonCard key={p.top} top={p.top} name={p.name} role={p.role} running={running} at={p.at} done={done} />
      ))}
    </View>
  );
}

function PersonRow({ top, name, running, at }: { top: number; name: `${number}%`; running: boolean; at: number }) {
  const { colors } = useTheme();
  const t = useCycle(running, at);
  return (
    <View style={{ position: 'absolute', left: 10, right: 10, top: top - 7, height: 20 }}>
      <Animated.View
        style={{
          ...absoluteFill,
          borderRadius: 6,
          backgroundColor: colors.primary,
          opacity: running ? t.interpolate({ inputRange: [0, 0.06, 0.24, 1], outputRange: [0, 0.16, 0, 0] }) : 0,
        }}
      />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, opacity: 0.5 }} />
        <View style={{ height: 6, width: name, borderRadius: 3, backgroundColor: colors.primary, opacity: 0.55 }} />
      </View>
    </View>
  );
}

function PersonCard({
  top,
  name,
  role,
  running,
  at,
  done,
}: {
  top: number;
  name: `${number}%`;
  role: `${number}%`;
  running: boolean;
  at: number;
  done: boolean;
}) {
  const { colors } = useTheme();
  const t = useCycle(running, at);
  const motion = running
    ? {
        opacity: t.interpolate({ inputRange: [0, 0.09, 0.72, 0.86, 1], outputRange: [0, 1, 1, 0, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 0.09, 0.14, 0.72, 0.86, 1], outputRange: [-56, 4, 0, 0, 8, 8] }) },
          { scale: t.interpolate({ inputRange: [0, 0.09, 0.14, 1], outputRange: [0.7, 1.03, 1, 1] }) },
        ],
      }
    : null;
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 112,
          top: top - 18,
          width: 160,
          height: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 10,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
          shadowColor: '#000',
          shadowOpacity: 0.14,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        },
        motion,
      ]}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
        <Icon name={done ? 'check' : 'user'} size={16} color={colors.onPrimary} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 8, width: name, borderRadius: 4, backgroundColor: colors.textDark, opacity: 0.7 }} />
        <View style={{ height: 6, width: role, borderRadius: 3, backgroundColor: colors.primary, opacity: 0.4 }} />
      </View>
    </Animated.View>
  );
}
const absoluteFill = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;
