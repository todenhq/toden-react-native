import React from 'react';
import { View } from 'react-native';

import { spacing } from '../config/theme';
import { useTheme, useVerificationConfig } from '../components/runtime';
import { isScopedBusiness } from '../lib/scope';
import { businessKey } from '../i18n/business-variants';
import { UiText } from '../components/Typography';
import { UiInput } from '../components/UiInput';
import { PhoneNumberInput } from '../components/PhoneNumberInput';
import { useText } from '../i18n/useText';

/**
 * "Where should we send it": an email field, or the dial-code phone input that
 * formats nationally and emits E.164. Mirrors the web SDK's component of the
 * same name and Flutter's ContactDestinationField.
 */
export function ContactDestinationField({
  isEmail,
  email,
  onEmailChange,
  onPhoneChange,
  defaultCountry,
  geoCountry,
  error,
  disabled,
}: {
  isEmail: boolean;
  email: string;
  onEmailChange: (value: string) => void;
  onPhoneChange: (value: { e164: string; isValid: boolean }) => void;
  defaultCountry?: string;
  /** The visitor's IP country, pinned to the top of the dial-code picker. */
  geoCountry?: string | null;
  error: string | null;
  disabled?: boolean;
}): React.ReactElement {
  const t = useText();
  // A scoped business workflow asks for the company's contact details.
  const config = useVerificationConfig();
  const scopedBusiness = isScopedBusiness(config);
  if (isEmail) {
    return (
      <UiInput
        label={t(businessKey('contact.email.label', scopedBusiness))}
        value={email}
        onChangeText={onEmailChange}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={error}
        editable={!disabled}
        autoFocus
      />
    );
  }

  return (
    <View>
      <UiText variant="label" style={{ marginBottom: spacing.xs }}>
        {t(businessKey('contact.phone.label', scopedBusiness))}
      </UiText>
      <PhoneNumberInput
        defaultCountry={defaultCountry}
        geoCountry={geoCountry}
        disabled={disabled}
        autoFocus
        // The dial-code countries the workflow offers; absent = all.
        countries={config.phoneVerification?.countries}
        onChange={onPhoneChange}
      />
      {error ? <ErrorLine text={error} /> : null}
    </View>
  );
}

function ErrorLine({ text }: { text: string }): React.ReactElement {
  const { colors } = useTheme();
  return (
    <UiText variant="bodySmall" color={colors.error} style={{ marginTop: spacing.xs }}>
      {text}
    </UiText>
  );
}
