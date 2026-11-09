import React from 'react';
import { View } from 'react-native';

import { UiInput } from '../components/UiInput';
import { spacing } from '../config/theme';
import { useText } from '../i18n/useText';
import type { BusinessProductDef } from '../config/business';
import type { RegistrationHint } from '../config/registrationHint';

// The registration number and the registered name. Shared by the first screen
// of the business step (when the number IS the question: search off, refused
// or "enter the number") and the second, where the register's answer is
// confirmed. Mirrors the web SDK's BusinessNumberFields.

export function BusinessNumberInputs({
  productDef,
  regHint,
  number,
  numberValid,
  formatOk,
  name,
  showName,
  requireName,
  onNumber,
  onName,
}: {
  productDef: BusinessProductDef;
  regHint: RegistrationHint;
  number: string;
  numberValid: boolean;
  formatOk: boolean;
  name: string;
  showName: boolean;
  requireName: boolean;
  onNumber: (value: string) => void;
  onName: (value: string) => void;
}): React.ReactElement {
  const t = useText();
  return (
    <View>
      <UiInput
        label={
          productDef.inputLabel === 'TIN'
            ? productDef.inputLabel
            : t('business.details.registrationNumberLabel')
        }
        value={number}
        onChangeText={onNumber}
        placeholder={regHint.placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        // Live like the web SDK: a wrong CAC prefix is corrected on the spot,
        // not discovered on Continue. The registry tip fills the same slot
        // until there is an error to show.
        error={
          number !== '' && !numberValid
            ? (!formatOk && regHint.formatError) ||
              `Enter a valid ${productDef.inputLabel.toLowerCase()}.`
            : null
        }
        helper={regHint.tip ?? undefined}
      />
      {showName ? (
        <>
          <View style={{ height: spacing.md }} />
          <UiInput
            label={`${t('business.details.nameLabel')}${requireName ? '' : ' (optional)'}`}
            value={name}
            onChangeText={onName}
            placeholder="Enter the registered business name"
            autoCorrect={false}
          />
        </>
      ) : null}
    </View>
  );
}
