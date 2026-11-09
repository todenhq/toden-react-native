import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius } from '../config/theme';
import { useTheme } from './runtime';
import { UiText } from './Typography';
import { CountryFlag } from './CountryFlag';
import type { DialCodeOption } from './DialCodePicker';

// ---------------------------------------------------------------------------
// One country in the dial-code sheet. Extracted from DialCodePicker (200-line
// rule) and shared by the pinned geo row and the alphabetical ones, so the two
// cannot drift apart: they are the same control in two positions, and the
// pinned one only differs by carrying a tag and a hairline beneath it.
//
// Drawn as the web sheet draws its options (CountrySummarySelect): a 44px
// rounded row, a 20px flag, the current answer filled rather than ticked.
// ---------------------------------------------------------------------------

export function DialCodeRow({
  option,
  isSelected,
  badge,
  onPress,
}: {
  option: DialCodeOption;
  isSelected: boolean;
  /** Tags a pinned row ("Selected", "Your location"). */
  badge?: string;
  onPress: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={badge ? `${option.name}, ${badge.toLowerCase()}` : option.name}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 44,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: radius.xs,
        backgroundColor: isSelected || pressed ? colors.backgroundSecondary : 'transparent',
      })}
    >
      <CountryFlag country={option.code} size={20} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <UiText variant="body" numberOfLines={1} style={{ flexShrink: 1, fontWeight: isSelected ? '500' : '400' }}>
          {option.name}
        </UiText>
        {badge ? <RowTag label={badge} onFill={isSelected} /> : null}
      </View>
      {option.dialCode != null ? (
        <UiText variant="bodyMedium" color={colors.textSecondary}>
          {option.dialCode}
        </UiText>
      ) : null}
    </Pressable>
  );
}

/**
 * The web's small uppercase tag. Its fill is the muted surface on a plain row
 * and the sheet's own colour on the filled one, so it stands off either.
 */
function RowTag({ label, onFill }: { label: string; onFill: boolean }): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.full,
        backgroundColor: onFill ? colors.background : colors.backgroundSecondary,
      }}
    >
      <UiText
        variant="bodySmall"
        color={colors.textSecondary}
        style={{ fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.25 }}
      >
        {label.toUpperCase()}
      </UiText>
    </View>
  );
}

/**
 * A region label between grouped rows — the web sheet's header (11px,
 * uppercase, tracked wide), so the pickers read as one control.
 */
export function DialCodeRegionHeader({ region }: { region: string }): React.ReactElement {
  const { colors } = useTheme();
  return (
    <UiText
      variant="bodySmall"
      color={colors.textSecondary}
      accessibilityRole="header"
      style={{
        fontSize: 11,
        lineHeight: 16,
        fontWeight: '600',
        letterSpacing: 1.1,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 4,
      }}
    >
      {region.toUpperCase()}
    </UiText>
  );
}

/** The hairline under the pinned rows, separating them from the regions. */
export function DialCodeDivider(): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginTop: 6,
        marginBottom: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    />
  );
}
