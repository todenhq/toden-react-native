import React from 'react';
import { View } from 'react-native';

import { radius, spacing } from '../config/theme';
import { useTheme } from './runtime';
import { UiText } from './Typography';
import { Icon } from './Icon';
import type { IconName } from './icons/names';

// Info / success / warning / error banner. Mirrors the Flutter SDK's UiAlert.
//
// Drawn as the dashboard's publish advisories are: a tinted card with a faint
// edge in the variant's colour, a round icon tile carrying the meaning, the
// title in the foreground colour and the message one step quieter. The colour
// sits in the icon and the edge, so the words stay readable on every surface.

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface UiAlertProps {
  variant: AlertVariant;
  title?: string;
  message: string;
}

const ICONS: Record<AlertVariant, IconName> = {
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  error: 'alert',
};

/** `#rrggbb` at the given alpha, as `#rrggbbaa`; anything else unchanged. */
function withAlpha(colour: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour;
  return `${colour}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

export function UiAlert({ variant, title, message }: UiAlertProps): React.ReactElement {
  const { colors } = useTheme();
  const bg =
    variant === 'success'
      ? colors.successBg
      : variant === 'warning'
        ? colors.warningBg
        : variant === 'error'
          ? colors.errorBg
          : colors.infoBg;
  const accent =
    variant === 'success'
      ? colors.success
      : variant === 'warning'
        ? colors.warning
        : variant === 'error'
          ? colors.error
          : colors.info;

  return (
    <View
      accessibilityRole={variant === 'error' || variant === 'warning' ? 'alert' : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 14,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: withAlpha(accent, 0.2),
        backgroundColor: withAlpha(bg, 0.6),
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha(accent, 0.15),
        }}
      >
        <Icon name={ICONS[variant]} size={14} color={accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingTop: title ? 4 : 5 }}>
        {title ? (
          <UiText variant="label" color={colors.textDark} style={{ fontWeight: '600', lineHeight: 20 }}>
            {title}
          </UiText>
        ) : null}
        <UiText
          variant="bodyMedium"
          color={colors.textSecondary}
          style={{ fontSize: 13, lineHeight: 20, marginTop: title ? spacing.xs : 0 }}
        >
          {message}
        </UiText>
      </View>
    </View>
  );
}
