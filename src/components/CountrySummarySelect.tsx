import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { radius, spacing } from '../config/theme';
import { regionCountryName } from '../config/regions';
import { useTheme } from './runtime';
import { UiText } from './Typography';
import { CountryFlag } from './CountryFlag';
import { DialCodePicker } from './DialCodePicker';
import { Icon } from './Icon';

// ---------------------------------------------------------------------------
// A country, picked from a summary row: a 40px round flag, a small caption over
// the country's name, and a Change pill. Used where the country is usually
// settled and only sometimes changed: the Proof of Address step, the combined
// ID-type step and the business's country of registration. Mirrors the web
// SDK's components/CountrySummarySelect.tsx.
//
// The list is THE country sheet (DialCodePicker), region-grouped and
// searchable, with the current answer pinned as "Selected" and the visitor's
// own country as "Your location" above the regions, so neither is a hunt
// through two hundred rows.
//
// One country on offer, or a locked answer, is a settled fact: the row
// without the pill.
// ---------------------------------------------------------------------------

/** The words the control shows, from the caller's own text group. */
export interface CountrySummaryCopy {
  placeholder: string;
  change: string;
  choose: string;
  search: string;
  noMatches: string;
  selected: string;
  yourLocation: string;
}

export function CountrySummarySelect({
  countries,
  value,
  onPick,
  label,
  geoCountry,
  copy,
  disabled,
  accessibilityName,
}: {
  countries: string[];
  value: string | null;
  onPick: (code: string) => void;
  /** The caption over the country: "Your address is in". */
  label: string;
  /** The visitor's own country, from their IP, pinned when on offer. */
  geoCountry?: string | null;
  copy: CountrySummaryCopy;
  /** Settled and not to be changed (a register that has answered). */
  disabled?: boolean;
  /** What a screen reader calls the field, when not the caption. */
  accessibilityName?: string;
}): React.ReactElement {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => countries.map((code) => ({ code, name: regionCountryName(code) })), [countries]);
  const geo = geoCountry?.toUpperCase() ?? null;

  const flag = value ? (
    <CountryFlag country={value} size={40} />
  ) : (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: radius.full,
        backgroundColor: colors.backgroundSecondary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="map-pin" size={18} color={colors.textSecondary} />
    </View>
  );

  const text = (name: string, muted: boolean): React.ReactElement => (
    <View style={{ flex: 1, minWidth: 0 }}>
      <UiText variant="bodySmall" color={colors.textSecondary} style={{ lineHeight: 16 }}>
        {label}
      </UiText>
      {/* The web's text-[15px]: off the type scale, so it keeps the copy face. */}
      <UiText
        variant="label"
        copyFace
        numberOfLines={1}
        color={muted ? colors.textSecondary : undefined}
        style={{ fontSize: 15, lineHeight: 20, fontWeight: muted ? '500' : '600' }}
      >
        {name}
      </UiText>
    </View>
  );

  const row = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    // 16 above and below the 40px flag: the height of the ID cards under it
    // (16 + 40 + 16 and the border), so the two stack as one list.
    minHeight: 74,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  };

  // One country on offer, or a locked answer: a settled fact, no pill.
  if (countries.length === 1 || (disabled && value)) {
    const only = disabled && value ? value : countries[0]!;
    return (
      <View
        accessible
        accessibilityLabel={`${accessibilityName ?? label}: ${regionCountryName(only)}`}
        style={[row, disabled ? { backgroundColor: colors.backgroundSecondary } : null]}
      >
        <CountryFlag country={only} size={40} />
        {text(regionCountryName(only), false)}
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityName ?? label}: ${value ? regionCountryName(value) : copy.placeholder}`}
        accessibilityHint={value ? copy.change : copy.choose}
        style={({ pressed }) => [row, pressed ? { borderColor: `${colors.primary}66`, backgroundColor: `${colors.primary}05` } : null]}
      >
        {flag}
        {text(value ? regionCountryName(value) : copy.placeholder, !value)}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 4,
            paddingLeft: 12,
            paddingRight: 8,
            borderRadius: radius.full,
            // Web's bg-primary/10, as a hex alpha on the brand colour.
            backgroundColor: `${colors.primary}1A`,
          }}
        >
          <UiText variant="bodySmall" copyFace color={colors.primary} style={{ lineHeight: 16, fontWeight: '600' }}>
            {value ? copy.change : copy.choose}
          </UiText>
          <Icon name="chevron-down" size={14} color={colors.primary} />
        </View>
      </Pressable>

      <DialCodePicker
        visible={open}
        options={options}
        selected={value ?? ''}
        pinned={geo}
        grouped
        searchPlaceholder={copy.search}
        selectedTag={copy.selected}
        geoTag={copy.yourLocation}
        emptyText={copy.noMatches}
        title={label}
        onPick={(code) => {
          setOpen(false);
          onPick(code);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
