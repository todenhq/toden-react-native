import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { spacing } from '../config/theme';
import { useFlowState, useVerificationConfig, useVerificationStore } from '../components/runtime';
import { UiButton } from '../components/UiButton';
import { useText } from '../i18n/useText';
import { BusinessRegistryPickers } from './BusinessRegistryPickers';
import { BusinessSearch } from './BusinessSearch';
import { BusinessPickedSection } from './BusinessPickedSection';
import { BusinessDetailsFields } from './BusinessDetailsFields';
import { BusinessCheckPanel } from './BusinessCheckPanel';
import { useBusinessRegions } from './BusinessRegionField';
import { businessPickView, nameSearchOffered, pickedBusinessName, SEARCH_REFUSED_FALLBACK } from '../config/businessSearch';
import { BusinessNumberEntry } from './BusinessNumberEntry';
import {
  businessCountriesFor,
  businessProductsForCountry,
  companyInfoFieldModes,
  getBusinessProductDef,
  keyPeopleNeedsContactEmail,
} from '../config/business';
import { registrationNumberHint } from '../config/registrationHint';
import { registerPrefillPatch } from '../config/businessPrefill';
import { businessDetailsValid, checkPanelVisible } from '../config/businessDetailsValidity';

// Business (KYB) registry details, two screens: 'pick' names WHICH company,
// 'details' confirms what the register said. Continue runs the paid check and
// moves between them. Mirrors the web SDK's BusinessDetailsStep (lockstep).

export function BusinessDetailsStep(): React.ReactElement {
  const config = useVerificationConfig();
  const t = useText();
  const store = useVerificationStore();
  const business = useFlowState((s) => s.business);
  const check = useFlowState((s) => s.businessCheck);
  // No search by name (switched off, or refused for this attempt) asks for the
  // registration number on the first screen instead; Continue still checks the
  // register and fills the second. Never "no matches" ("not registered").
  const [searchRefused, setSearchRefused] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(false);
  const searchOn = nameSearchOffered(config.business) && searchRefused === null;
  const [phase, setPhase] = useState<'pick' | 'details'>('pick');
  // Read on every render (a config changing while mounted lands right).
  const picked = business.registrationNumber.trim() !== '';
  const view = businessPickView({
    searchOffered: nameSearchOffered(config.business),
    refused: searchRefused !== null,
    manualEntry,
    picked,
  });
  // Production never shows the test-result toggle, and never honours a pin.
  const isSandbox = useFlowState((s) => s.serverConfig.environment) !== 'PRODUCTION';
  const geoCountry = useFlowState((s) => s.serverConfig.geoCountry);

  const workflowBusiness = config.business;
  const countries = useMemo(() => businessCountriesFor(workflowBusiness), [workflowBusiness]);
  // The visitor's pick, then the workflow's PRIMARY country, then the head.
  const country = business.country ?? workflowBusiness?.country ?? countries[0] ?? '';
  const products = useMemo(
    () => businessProductsForCountry(workflowBusiness, country),
    [workflowBusiness, country],
  );
  const product = products.includes(business.product ?? '') ? business.product! : products[0]!;
  const productDef = getBusinessProductDef(product);

  // The search carries the region picker; without it number entry has to.
  const regions = useBusinessRegions(view.numberEntry ? country : '');
  const modes = companyInfoFieldModes(workflowBusiness);
  const showCompanyInfo = Object.values(modes).some((m) => m !== 'off');
  const showContactEmail = keyPeopleNeedsContactEmail(workflowBusiness);

  const set = <K extends keyof typeof business>(key: K, value: (typeof business)[K]): void =>
    store.getState().setBusinessField(key, value);

  const regHint = registrationNumberHint(country, productDef);
  const regNumber = business.registrationNumber;
  const nameRequired = workflowBusiness?.requireRegistrationName === true;
  const formatOk =
    !regHint.isValidFormat || regNumber.trim() === '' || regHint.isValidFormat(regNumber);
  const numberValid = regNumber.trim().length >= 2 && formatOk;

  const isFormValid = businessDetailsValid({
    phase,
    business,
    modes,
    product,
    numberValid,
    nameRequired,
    showContactEmail,
    regionMissing: regions.length > 0 && !business.subdivisionCode,
  });

  const checking = check.status === 'checking';
  // What both the number box and the details screen are drawn from.
  const fieldProps = {
    business, productDef, regHint, numberValid, formatOk, requireName: nameRequired, regions, onChange: set,
  };

  const handleContinue = async (): Promise<void> => {
    if (!isFormValid || checking) return;
    // Persist the resolved country/product, only when different: these are
    // identity keys, and an unchanged write would reset the check just run.
    if (business.country !== country) set('country', country);
    if (business.product !== product) set('product', product);

    // The paid registry check. Only a definitive "not on the register" stops
    // the flow; a short balance or an outage continues to submission.
    const { canContinue, company } = await store.getState().checkBusiness();
    if (!canContinue) return;

    // First Continue ends at the details screen, to confirm what it said.
    if (phase === 'pick') {
      const { patch, prefilled } = registerPrefillPatch(company, store.getState().business);
      if (prefilled.length > 0) store.getState().applyBusinessPrefill(patch, prefilled);
      setPhase('details');
      return;
    }
    store.getState().nextStep();
  };

  return (
    <View>
      <BusinessRegistryPickers
        country={country}
        countries={countries}
        product={product}
        products={products}
        geoCountry={geoCountry}
        onCountry={(code) => {
          set('country', code);
          set('product', null); // products narrow per country: clear a stale pick
        }}
        onProduct={(key) => set('product', key)}
      />

      {/* Hidden, not unmounted, so Change keeps the query and results. */}
      {searchOn ? (
        <View style={{ display: phase === 'pick' && country && view.search ? 'flex' : 'none' }}>
        <BusinessSearch
          country={country}
          onRefused={(message) => setSearchRefused(message ?? SEARCH_REFUSED_FALLBACK)}
          onPicked={(hit) => {
            // Names the company only: the register is asked on Continue.
            set('registrationNumber', hit.registrationNumber);
            set('registrationName', pickedBusinessName(hit.name));
          }}
          onManualEntry={() => setManualEntry(true)}
        />
        </View>
      ) : null}

      {phase === 'pick' && view.numberEntry ? (
        <BusinessNumberEntry {...fieldProps} notice={searchRefused} country={country} isSandbox={isSandbox} />
      ) : null}

      {phase === 'pick' && view.card ? (
        <BusinessPickedSection
          country={country}
          name={business.registrationName}
          registrationNumber={regNumber}
          isSandbox={isSandbox}
          onChange={() => {
            // Back to the search rather than an undo: they are changing WHICH
            // company this is about, and the fields belong to the old one.
            set('registrationNumber', '');
            set('registrationName', '');
          }}
        />
      ) : null}

      {phase === 'details' ? (
        <BusinessDetailsFields
          {...fieldProps}
          country={country}
          geoCountry={geoCountry}
          modes={modes}
          showCompanyInfo={showCompanyInfo}
          showContactEmail={showContactEmail}
        />
      ) : null}

      {checkPanelVisible(check.status) ? (
        <>
          <View style={{ height: spacing.lg }} />
          <BusinessCheckPanel check={check} />
        </>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <UiButton
        label={
          checking ? 'Checking…' : phase === 'details' ? t('business.details.confirm') : t('common.continue')
        }
        onPress={() => void handleContinue()}
        loading={checking}
        disabled={!isFormValid || checking}
      />
    </View>
  );
}

