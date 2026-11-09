import React from 'react';
import { View } from 'react-native';

import { UiAlert } from '../components/UiAlert';
import { spacing } from '../config/theme';
import { BusinessRegionField, type BusinessRegion } from './BusinessRegionField';
import { BusinessNumberInputs } from './BusinessNumberInputs';
import { BusinessPickedSection } from './BusinessPickedSection';
import type { BusinessState } from '../store/state';
import type { BusinessProductDef } from '../config/business';
import type { RegistrationHint } from '../config/registrationHint';

// The first screen of the business step when there is no search by name
// (switched off, refused, or "enter the number"): the registration number is
// the whole question. The name is asked only when the workflow requires it;
// the register supplies it on Continue, which then opens the details screen
// filled in from the register's answer. Mirrors the web SDK (lockstep).

export function BusinessNumberEntry({
  business,
  productDef,
  regHint,
  numberValid,
  formatOk,
  requireName,
  notice,
  regions,
  country,
  isSandbox,
  onChange,
}: {
  business: BusinessState;
  productDef: BusinessProductDef;
  regHint: RegistrationHint;
  numberValid: boolean;
  formatOk: boolean;
  requireName: boolean;
  /** Why search by name is not on offer (the server's words), or null. */
  notice: string | null;
  regions: BusinessRegion[];
  country: string;
  isSandbox: boolean;
  onChange: <K extends keyof BusinessState>(key: K, value: BusinessState[K]) => void;
}): React.ReactElement {
  const number = business.registrationNumber;
  return (
    <View>
      {notice ? (
        <View style={{ marginBottom: spacing.md }}>
          <UiAlert variant="info" message={notice} />
        </View>
      ) : null}
      <BusinessRegionField regions={regions} region={business.subdivisionCode} />
      <BusinessNumberInputs
        productDef={productDef}
        regHint={regHint}
        number={number}
        numberValid={numberValid}
        formatOk={formatOk}
        name={business.registrationName}
        showName={requireName}
        requireName={requireName}
        onNumber={(text) => onChange('registrationNumber', text)}
        onName={(text) => onChange('registrationName', text)}
      />
      {number.trim() !== '' ? (
        <>
          <View style={{ height: spacing.md }} />
          <BusinessPickedSection
            country={country}
            name={business.registrationName}
            registrationNumber={number}
            isSandbox={isSandbox}
            showCard={false}
            onChange={() => onChange('registrationNumber', '')}
          />
        </>
      ) : null}
    </View>
  );
}
