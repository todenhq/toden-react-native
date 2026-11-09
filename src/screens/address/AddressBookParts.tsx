import React from 'react';
import { Pressable, View } from 'react-native';

import { radius, spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { Icon, type IconName } from '../../components/Icon';
import { savedAddressLine, type SavedAddress } from '../../lib/address-book';
import { useText } from '../../i18n/useText';

// The saved address sheets' pieces, shared with the address book step.
// A MIRROR of the web SDK's steps/address/AddressBookParts.tsx.

/** A sheet's opening: its icon, title and one line of why, centred. */
export function SheetHeading({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.full,
          backgroundColor: `${colors.primary}1A`,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.sm + 4,
        }}
      >
        <Icon name={icon} size={24} color={colors.primary} />
      </View>
      <UiText variant="heading3" color={colors.textDark} accessibilityRole="header" style={{ textAlign: 'center' }}>
        {title}
      </UiText>
      <UiText variant="bodyMedium" color={colors.textDark} style={{ textAlign: 'center', marginTop: spacing.xs }}>
        {description}
      </UiText>
    </View>
  );
}

/** The saved addresses as a single-choice list. */
export function SavedAddressList({
  addresses,
  selected,
  onSelect,
}: {
  addresses: SavedAddress[];
  selected: string | null;
  onSelect: (entryId: string) => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('address.book.pick.title')}>
      {addresses.map((a) => {
        const on = a.entryId === selected;
        const line = savedAddressLine(a) || a.countryCode || '';
        return (
          <Pressable
            key={a.entryId}
            onPress={() => onSelect(a.entryId)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={line}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 56,
              gap: 12,
              paddingHorizontal: spacing.md,
              paddingVertical: 12,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.border,
              backgroundColor: on ? `${colors.primary}0F` : colors.background,
              marginBottom: spacing.sm,
            }}
          >
            <Icon name="map-pin" size={20} color={on ? colors.primary : colors.textDark} />
            <View style={{ flex: 1 }}>
              <UiText variant="label" color={colors.textDark} numberOfLines={1}>
                {line}
              </UiText>
              {a.presenceStatus === 'verified' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Icon name="map-pin-check" size={14} color={colors.success} />
                  <UiText variant="bodySmall" color={colors.success}>
                    {t('address.book.presence.verified')}
                  </UiText>
                </View>
              ) : null}
            </View>
            {on ? <Icon name="circle-check" size={20} color={colors.primary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The saved address already picked (returning to this step). */
export function ChosenAddress({ label, area }: { label: string | null; area: string | null }): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  return (
    <View
      style={{
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: `${colors.primary}33`,
        backgroundColor: `${colors.primary}0F`,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderRadius: radius.full,
          backgroundColor: `${colors.primary}1A`,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}
      >
        <Icon name="book-user" size={12} color={colors.primary} />
        <UiText variant="bodySmall" color={colors.primary} style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.8 }}>
          {t('address.book.chosen.badge').toUpperCase()}
        </UiText>
      </View>
      <UiText variant="body" style={{ marginTop: spacing.sm, fontWeight: '600' }}>
        {savedAddressLine({ label, area })}
      </UiText>
    </View>
  );
}
