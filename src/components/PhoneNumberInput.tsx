import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

import { radius, sizing, spacing } from '../config/theme';
import { useTheme } from './runtime';
import { UiText } from './Typography';
import { UiInput } from './UiInput';
import { Icon } from './Icon';
import { CountryFlag } from './CountryFlag';
import { DialCodePicker, type DialCodeOption } from './DialCodePicker';
import { formatNationalNumber } from '../config/phone';
// Names come from the generated table, NOT Intl.DisplayNames: Hermes may ship
// without region data, and every row then reads as a bare ISO code.
import { COUNTRY_NAMES } from '../config/countryNames.g';
import { useText } from '../i18n/useText';
import { offeredPhoneOptions, startingPhoneCountry } from '../lib/phone-countries';

// ---------------------------------------------------------------------------
// Phone field: a dial-code country picker beside a nationally-formatted number.
//
// The RN mirror of the web SDK's PhoneNumberInput and Flutter's
// phone_number_input.dart. Before this the step was a bare text field asking
// for "+2348012345678" — the user had to know their own country code and type
// it, and validity was a length guess.
//
// Formatting and validity both come from libphonenumber: "8031234567" shows as
// "803 123 4567" for NG, and a wrong-length number is rejected by the country's
// actual numbering plan rather than a 6–15 digit heuristic.
// ---------------------------------------------------------------------------

export function PhoneNumberInput({
  value,
  defaultCountry,
  geoCountry,
  disabled,
  autoFocus = false,
  countries,
  onChange,
}: {
  /**
   * E.164 seed. The field itself stays uncontrolled (the formatter owns the
   * text), but a value arriving after mount — the register's, prefilled a
   * moment later — has to reach the field, or we hold a number the applicant
   * can neither see nor correct and submit it as though they gave it.
   */
  value?: string;
  /** Seeds the picker (ISO-2). Falls back to NG. */
  defaultCountry?: string;
  /**
   * The visitor's IP country. Pinned to the top of the picker and tagged, so
   * a guess we made on their behalf is visible AS a guess and one tap away
   * rather than buried at its alphabetical position. Mirrors the web SDK.
   */
  geoCountry?: string | null;
  disabled?: boolean;
  /** Focus + keyboard on mount. Opt-in: right for a single-field OTP screen,
   *  wrong for a row in a company-profile form. */
  autoFocus?: boolean;
  /**
   * The dial-code countries on offer (ISO-2), the workflow's choice; absent or
   * empty offers every country. With one, its code is shown fixed, with no picker.
   */
  countries?: readonly string[];
  /** Fires on every edit with the E.164 value ('' until parseable) + validity. */
  onChange: (value: { e164: string; isValid: boolean; country: string }) => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();

  const offered = countries?.length ? countries.map((c) => c.toUpperCase()).sort().join(',') : '';
  const options = useMemo<DialCodeOption[]>(
    () =>
      offeredPhoneOptions(
        getCountries()
        // Only countries the shared table can name. libphonenumber lists five
        // that it cannot (AC, CC, CX, IO, TA — dependencies with populations in
        // the hundreds, reachable on their parent country's code anyway), and a
        // row reading "AC" is worse than no row. Dropping them also makes this
        // list exactly Flutter's, which is generated from the same table.
        .filter((code) => COUNTRY_NAMES[code])
        .map((code) => ({
          code,
          name: COUNTRY_NAMES[code] as string,
          dialCode: `+${getCountryCallingCode(code)}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
        offered ? offered.split(',') : undefined,
      ),
    [offered],
  );
  // One country on offer: nothing to choose, so its code is shown fixed.
  const fixed = options.length === 1;

  // A supplied number decides its OWN dial code — it is a fact, where the
  // country prop is a guess. Falls through to the guess when there is no
  // number or it cannot be parsed.
  const supplied = value ? parsePhoneNumberFromString(value) : null;
  const seed = (supplied?.country ??
    defaultCountry?.toUpperCase() ??
    'NG') as CountryCode;
  // A seed outside the countries on offer gives way to one that is.
  const [country, setCountry] = useState<CountryCode>(startingPhoneCountry(seed, options) as CountryCode);
  // The list can arrive after the field (a workflow resolved late): keep the
  // chosen code inside it.
  const firstOffered = options[0]?.code;
  const outside = !options.some((o) => o.code === country);
  useEffect(() => {
    if (outside && firstOffered) setCountry(firstOffered as CountryCode);
  }, [outside, firstOffered]);
  const [national, setNational] = useState(() =>
    supplied ? formatNationalNumber(supplied.nationalNumber, seed) : '',
  );
  // A number that arrives AFTER mount — the register's, prefilled a moment
  // later — has to reach the field. Seeding is one-way and keyed on the value,
  // so the applicant's own edits are never fought.
  const seededRef = useRef(value ?? '');
  useEffect(() => {
    if (!value || value === seededRef.current) return;
    seededRef.current = value;
    const parsed = parsePhoneNumberFromString(value);
    if (!parsed) return;
    const next = (parsed.country ?? country) as CountryCode;
    setCountry(next);
    setNational(formatNationalNumber(parsed.nationalNumber, next));
  }, [value, country]);
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.code === country);

  const emit = (nextCountry: CountryCode, nextNational: string): void => {
    const parsed = parsePhoneNumberFromString(nextNational, nextCountry);
    onChange({
      e164: parsed?.number ?? '',
      isValid: parsed?.isValid() ?? false,
      country: nextCountry,
    });
  };

  // The caret sits at the end: separators shift on nearly every keystroke, so
  // tracking an interior caret fights the formatter more than it helps.
  const onTyped = (raw: string): void => {
    const formatted = formatNationalNumber(raw, country);
    setNational(formatted);
    emit(country, formatted);
  };

  const pickCountry = (code: string): void => {
    const next = code as CountryCode;
    setCountry(next);
    setOpen(false);
    // Re-group the digits already typed under the new country's plan.
    const regrouped = formatNationalNumber(national, next);
    setNational(regrouped);
    emit(next, regrouped);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {fixed ? (
          // The one country the workflow offers: its flag and code, fixed.
          <View
            accessible
            accessibilityLabel={`${selected?.name ?? country} ${selected?.dialCode ?? ''}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              paddingHorizontal: spacing.sm + 2,
              height: sizing.inputHeight,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.sm,
              backgroundColor: colors.backgroundSecondary,
            }}
          >
            <CountryFlag country={country} size={22} />
            <UiText variant="body">{selected?.dialCode ?? ''}</UiText>
          </View>
        ) : (
        <Pressable
          onPress={disabled ? undefined : () => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Country code ${selected?.dialCode ?? ''}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingHorizontal: spacing.sm + 2,
            height: sizing.inputHeight,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.sm,
            backgroundColor: colors.background,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <CountryFlag country={country} size={22} />
          <UiText variant="body">{selected?.dialCode ?? ''}</UiText>
          <Icon name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
        )}

        <View style={{ flex: 1 }}>
          <UiInput
            value={national}
            onChangeText={onTyped}
            placeholder="803 123 4567"
            keyboardType="phone-pad"
            editable={!disabled}
            autoFocus={autoFocus}
          />
        </View>
      </View>

      <DialCodePicker
        visible={open}
        options={options}
        selected={country}
        pinned={geoCountry}
        title={t('contact.phone.codeTitle')}
        onPick={pickCountry}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
