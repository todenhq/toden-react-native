import React from 'react';
import { View } from 'react-native';

import { UiInput } from '../components/UiInput';
import { UiAlert } from '../components/UiAlert';
import { BusinessRegionField, type BusinessRegion } from './BusinessRegionField';
import { BusinessNumberInputs } from './BusinessNumberInputs';
import { spacing } from '../config/theme';
import { CompanyInfoFields } from './CompanyInfoFields';
import { isValidContactEmail } from '../config/contact';
import { useText } from '../i18n/useText';
import type { BusinessState } from '../store/state';
import type { BusinessProductDef } from '../config/business';
import type { RegistrationHint } from '../config/registrationHint';
import type { CompanyInfoField, CompanyInfoMode } from '../types/business';

// ---------------------------------------------------------------------------
// The DETAILS screen of the business step: confirming what the register said.
//
// Registration number and name stay editable here: the register has answered
// by now, and this is where its answer is confirmed or corrected. Split from
// BusinessDetailsStep (200-line rule); field order mirrors the web SDK.
// ---------------------------------------------------------------------------

export function BusinessDetailsFields({
  business,
  productDef,
  regHint,
  numberValid,
  formatOk,
  requireName,
  country,
  geoCountry,
  modes,
  showCompanyInfo,
  showContactEmail,
  notice,
  regions,
  onChange,
}: {
  business: BusinessState;
  productDef: BusinessProductDef;
  regHint: RegistrationHint;
  numberValid: boolean;
  formatOk: boolean;
  requireName: boolean;
  country: string;
  geoCountry?: string | null;
  modes: Record<CompanyInfoField, CompanyInfoMode>;
  showCompanyInfo: boolean;
  showContactEmail: boolean;
  /** Why search by name is not on offer (the server's words), or null. */
  notice?: string | null;
  /** Registry regions, when number entry has to ask for one. */
  regions?: BusinessRegion[];
  onChange: <K extends keyof BusinessState>(key: K, value: BusinessState[K]) => void;
}): React.ReactElement {
  const t = useText();
  const regNumber = business.registrationNumber;
  const contactEmail = business.contactEmail;
  const contactEmailInvalid =
    contactEmail.trim() !== '' && !isValidContactEmail(contactEmail.trim());
  return (
    <View>
      {notice ? (
        <View style={{ marginBottom: spacing.md }}>
          <UiAlert variant="info" message={notice} />
        </View>
      ) : null}
      <BusinessRegionField regions={regions ?? []} region={business.subdivisionCode} />
      <BusinessNumberInputs
        productDef={productDef}
        regHint={regHint}
        number={regNumber}
        numberValid={numberValid}
        formatOk={formatOk}
        name={business.registrationName}
        showName
        requireName={requireName}
        onNumber={(text) => onChange('registrationNumber', text)}
        onName={(text) => onChange('registrationName', text)}
      />

      {showCompanyInfo ? (
        <>
          <View style={{ height: spacing.md }} />
          <CompanyInfoFields
            values={business}
            modes={modes}
            country={country}
            geoCountry={geoCountry}
            onChange={(field, value) => onChange(field, value)}
          />
        </>
      ) : null}

      {showContactEmail ? (
        <>
          <View style={{ height: spacing.md }} />
          <UiInput
            label={`${t('business.contactEmail.label')} (optional)`}
            value={contactEmail}
            onChangeText={(text) => onChange('contactEmail', text)}
            placeholder="admin@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            helper={t('business.contactEmail.hint')}
            error={contactEmailInvalid ? 'Enter a valid email address.' : null}
          />
        </>
      ) : null}
    </View>
  );
}
