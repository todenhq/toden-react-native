import React from 'react';
import { View } from 'react-native';

import { radius, spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { Icon } from '../../components/Icon';
import type { BusinessDocumentGroup } from '../../config/businessDocumentGroups';
import { BUSINESS_DOCUMENTS_COPY as COPY } from './copy';

// ---------------------------------------------------------------------------
// The pieces of a group: its number circle (with a tick badge once it holds a
// file) and the documents it accepts as a short list, each one's
// validity on its own line. Mirrors the web SDK's GroupPanel and GroupRow.
// ---------------------------------------------------------------------------

export function GroupNumber({
  number,
  done = false,
  tucked = false,
}: {
  number: number;
  /** Holds a file: the number stays, with a small tick badge on its corner. */
  done?: boolean;
  /** On a card tucked behind the open one: muted, on the screen's background. */
  tucked?: boolean;
}): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tucked ? colors.background : colors.primary100,
      }}
    >
      <UiText
        variant="bodySmall"
        color={tucked ? colors.textMuted : colors.primary}
        style={{ fontWeight: '600', fontSize: tucked ? 12 : 14, fontVariant: ['tabular-nums'] }}
      >
        {String(number)}
      </UiText>
      {done ? (
        // Offset outward, ringed in the screen's background so it reads as a badge.
        <View
          style={{
            position: 'absolute',
            bottom: -4,
            right: -6,
            width: 16,
            height: 16,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.success,
            borderWidth: 2,
            borderColor: colors.background,
          }}
        >
          <Icon name="check" size={10} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : null}
    </View>
  );
}

/** The documents a group accepts, any one of them, with how recent each must be. */
export function AcceptedDocuments({ group }: { group: BusinessDocumentGroup }): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: spacing.md }}>
      <UiText variant="bodySmall" color={colors.textMuted} style={{ fontWeight: '500', marginBottom: 6 }}>
        {group.types.length > 1 ? COPY.accepts : COPY.acceptsOne}
      </UiText>
      <View accessibilityRole="list" style={{ gap: 4 }}>
        {group.types.map((type) => (
          <View key={type.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            <View style={{ marginTop: 3 }}>
              <Icon name="file-text" size={14} color={colors.textMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <UiText variant="bodyMedium">{type.label}</UiText>
              {type.maxAgeMonths != null ? (
                <UiText variant="bodySmall" color={colors.textMuted}>
                  {COPY.validity(type.maxAgeMonths)}
                </UiText>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
