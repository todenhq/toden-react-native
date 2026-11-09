import React from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing } from '../config/theme';
import { useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { Icon, type IconName } from '../components/Icon';
import type { AllowSteps } from '../presence/background-allow-steps';

// The pieces of the "allow all the time" screen. Mirrors the Flutter SDK's
// widgets/background_ask_parts.dart; keep the two in lockstep.

export interface AskReason {
  icon: IconName;
  title: string;
  caption: string;
}

/** The radar in two soft rings: the area around the address being watched. */
export function AskHero(): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 76,
        height: 76,
        borderRadius: radius.full,
        backgroundColor: `${colors.primary}14`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.full,
          backgroundColor: `${colors.primary}2E`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="radar" size={26} color={colors.primary} />
      </View>
    </View>
  );
}

/** The reasons as one grouped card, so they read as a single answer. */
export function AskReasons({ reasons }: { reasons: AskReason[] }): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: radius.lg, backgroundColor: colors.backgroundSecondary, overflow: 'hidden' }}>
      {reasons.map((r, i) => (
        <View
          key={r.title}
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            alignItems: 'center',
            padding: spacing.md,
            borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.full,
              backgroundColor: `${colors.primary}24`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={r.icon} size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <UiText variant="heading3">{r.title}</UiText>
            <UiText variant="bodySmall" color={colors.textSecondary} style={{ marginTop: 2 }}>
              {r.caption}
            </UiText>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * What the phone will ask next and the words to tap. The prompt is roughly a
 * one-time chance, so this is an instruction, not a footnote. It shares the
 * reasons' row shape and draws no options: anything resembling a control here
 * reads as a choice to make on this screen.
 */
export function AskNextStep({ steps }: { steps: AllowSteps }): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${steps.lead} ${steps.tap}`}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: `${colors.primary}1A`,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.full,
          backgroundColor: `${colors.primary}2E`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="smartphone" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <UiText variant="bodySmall" color={colors.textSecondary}>{steps.lead}</UiText>
        <UiText variant="heading3" style={{ marginTop: 2 }}>{steps.tap}</UiText>
      </View>
    </View>
  );
}
