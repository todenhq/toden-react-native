import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

import { UiText } from './Typography';
import { MilestoneTrack, type Milestone } from './MilestoneTrack';
import { useReduceMotion } from './StaggerIn';
import { radius, spacing } from '../config/theme';
import { useTheme } from './theme-provider';
import { useText } from '../i18n/useText';
import type { TextFn } from '../i18n/types';
import { useVerificationConfig } from './runtime';
import { UiButton } from './UiButton';
import { effortWithoutBackground, finishSentence } from '../presence/background-primer';
import type { BackgroundOutcome } from '../presence/use-background-ask';

// ---------------------------------------------------------------------------
// The success screen's presence card, drawn as a LIVE PROCESS rather than a
// notice: the check began the moment they submitted, so the card should feel
// like something is already quietly working, because it is.
//
// Its milestones are the same three the intro gate promises, one frame later —
// keep the two, and the web and Flutter SDKs, in lockstep.
//
// The standalone "presence consent notice" that used to live here is gone: the
// disclosures belong on the intro gate, and a second copy on the address step
// was one more place for the consent wording to drift.
// ---------------------------------------------------------------------------

const milestones = (t: TextFn): readonly Milestone[] => [
  {
    icon: 'map-pin-check',
    stage: t('address.presence.step1.stage'),
    title: t('address.presence.step1.title'),
    caption: t('address.presence.step1.caption'),
    state: 'active',
  },
  {
    icon: 'radar',
    stage: t('address.presence.step2.stage'),
    title: t('address.presence.step2.title'),
    caption: t('address.presence.step2.caption'),
    state: 'ahead',
  },
  {
    icon: 'bell-ring',
    stage: t('address.presence.step3.stage'),
    title: t('address.presence.step3.title'),
    caption: t('address.presence.step3.caption'),
    state: 'ahead',
  },
];

export function PresenceExpectations({
  background = null,
  onTurnOn,
}: {
  /** The "allow all the time" answer: `'off'` swaps the header for the work
   *  still to do and a way to turn checks on; null keeps the usual wording. */
  background?: BackgroundOutcome;
  onTurnOn?: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  const config = useVerificationConfig();
  const business = config.subjectType === 'business';
  const off = background === 'off';
  const title = off ? t('address.presence.off.title') : t('address.presence.title');
  const description = off
    ? finishSentence(effortWithoutBackground(config.addressCollection?.presence, business), business)
    : background === 'on'
      ? 'Automatic checks are on. Nothing else for you to do.'
      : t('address.presence.description');
  return (
    <View
      style={{
        alignSelf: 'stretch',
        marginTop: spacing.lg,
        borderWidth: 1,
        borderColor: `${colors.primary}26`,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          backgroundColor: `${colors.primary}0F`,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm + 4,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: spacing.sm,
            paddingHorizontal: spacing.sm + 2,
            paddingVertical: 4,
            borderRadius: radius.full,
            backgroundColor: `${colors.primary}1A`,
          }}
        >
          <LiveDot />
          <UiText
            variant="bodySmall"
            color={colors.primary}
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            {t('address.presence.badge')}
          </UiText>
        </View>
        <UiText variant="bodyMedium" style={{ fontWeight: '600', marginTop: spacing.sm }}>
          {title}
        </UiText>
        <UiText variant="bodySmall" color={colors.textSecondary} style={{ marginTop: 2 }}>
          {description}
        </UiText>
        {off && onTurnOn ? (
          <View style={{ marginTop: spacing.sm + 4 }}>
            <UiButton variant="outline" label={t('address.background.allow')} onPress={onTurnOn} />
          </View>
        ) : null}
      </View>

      {/* Web's h-8 nodes here, against the primer's h-10. */}
      <MilestoneTrack milestones={milestones(t)} nodeSize={32} />
    </View>
  );
}

/** The badge's pulse — the one thing on the card that says "running now". */
function LiveDot(): React.ReactElement {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  return (
    <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
      {reduceMotion ? null : (
        <Animated.View
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            borderRadius: radius.full,
            backgroundColor: colors.primary,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) },
            ],
          }}
        />
      )}
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: radius.full,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
}
