import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { Icon } from '../../components/Icon';
import { StaggerIn } from '../../components/StaggerIn';
import type { ConsentProcessStep } from './model';

// ---------------------------------------------------------------------------
// What the flow will do, as an inset grouped list: a quiet heading over one
// card of rows, each a small icon tile and a line of text, hairlines between.
// No numbers, no counts. The rows rise in one after another (reduced motion:
// at once). The card casts a shadow on a dark sheet only: light mode stays
// flat. Mirrors the web SDK's steps/ConsentJourney.tsx.
// ---------------------------------------------------------------------------

export function ConsentJourney({ steps, heading }: { steps: ConsentProcessStep[]; heading: string }): React.ReactElement {
  const { colors, mode } = useTheme();
  return (
    <View style={{ borderRadius: 16, backgroundColor: `${colors.backgroundSecondary}80`, padding: 6 }}>
      <UiText
        variant="bodySmall"
        color={colors.textSecondary}
        accessibilityRole="header"
        style={{ fontWeight: '500', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}
      >
        {heading}
      </UiText>
      <View
        accessibilityRole="list"
        style={[
          { borderRadius: 12, backgroundColor: colors.background, overflow: mode === 'dark' ? 'visible' : 'hidden' },
          mode === 'dark'
            ? { shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
            : null,
        ]}
      >
        {steps.map((step, index) => (
          <StaggerIn key={step.label} delayMs={60 + index * 45}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: `${colors.border}99`,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: `${colors.primary}1A`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={step.icon} size={16} color={colors.primary} />
              </View>
              <UiText variant="bodyMedium" color={colors.textDark} style={{ flex: 1, fontWeight: '500', lineHeight: 19 }}>
                {step.label}
              </UiText>
            </View>
          </StaggerIn>
        ))}
      </View>
    </View>
  );
}
