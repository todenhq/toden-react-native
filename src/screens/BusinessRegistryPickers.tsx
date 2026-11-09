import React from 'react';
import { View } from 'react-native';

import { CountrySummarySelect } from '../components/CountrySummarySelect';
import { UiSelect } from '../components/UiSelect';
import { UiText } from '../components/Typography';
import { useText } from '../i18n/useText';
import { getBusinessProductDef } from '../config/business';
import { spacing } from '../config/theme';

// The registry pickers: which country's register, and which product to run
// against it. Rendered only when there is a choice to make. Split from
// BusinessDetailsStep (200-line rule).

export function BusinessRegistryPickers({
  country,
  countries,
  product,
  products,
  geoCountry,
  onCountry,
  onProduct,
}: {
  country: string;
  countries: string[];
  /** Where the visitor appears to be, pinned in the country list. */
  geoCountry?: string | null;
  product: string;
  products: string[];
  onCountry: (code: string) => void;
  onProduct: (key: string) => void;
}): React.ReactElement {
  const t = useText();
  return (
    <>
      {countries.length > 1 ? (
        <>
          {/* The summary row the PoA and ID steps use (CountrySummarySelect).
              Where they appear to be is pinned in its list: a guess, tagged
              as one, and the register they pick is what counts. */}
          <CountrySummarySelect
            countries={countries}
            value={country || null}
            label={t('business.details.countryCaption')}
            accessibilityName={t('business.details.countryLabel')}
            geoCountry={geoCountry ?? null}
            onPick={onCountry}
            copy={{
              placeholder: t('business.country.placeholder'),
              change: t('business.country.change'),
              choose: t('business.country.choose'),
              search: t('business.country.searchPlaceholder'),
              noMatches: t('business.country.noMatch'),
              selected: t('business.country.selected'),
              yourLocation: t('business.details.countryPinnedLocation'),
            }}
          />
          <View style={{ height: spacing.lg }} />
        </>
      ) : null}

      {products.length > 1 ? (
        <>
          <UiText variant="label" style={{ marginBottom: spacing.sm }}>
            Verification type
          </UiText>
          <UiSelect
            value={product}
            sheetTitle="Verification type"
            options={products.map((key) => ({
              value: key,
              label: getBusinessProductDef(key).label,
            }))}
            onChange={onProduct}
          />
          <View style={{ height: spacing.lg }} />
        </>
      ) : null}

    </>
  );
}
