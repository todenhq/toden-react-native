import React, { useEffect } from 'react';

import { CountrySummarySelect } from '../components/CountrySummarySelect';
import { useFlowState, useVerificationConfig, useVerificationStore } from '../components/runtime';
import { useText } from '../i18n/useText';

// ---------------------------------------------------------------------------
// The country that issued the ID, at the top of the ID-type step: the
// `combined` layout (lib/id-selection-layout.ts), in the summary row the
// Proof of Address step uses. Changing it swaps the ID list beneath, as the
// country step would have. Mirrors the web SDK's steps/IdCountryField.tsx.
//
// It opens holding an answer rather than an empty field, since the list under
// it needs a country to show anything: the workflow's own country when it is
// on offer, else the visitor's, else the first offered. That pick is marked
// automatic, as an IP guess is elsewhere.
// ---------------------------------------------------------------------------

export function IdCountryField({ options }: { options: string[] }): React.ReactElement {
  const config = useVerificationConfig();
  const store = useVerificationStore();
  const t = useText();
  const selected = useFlowState((s) => s.selectedCountry);
  const geo = useFlowState((s) => s.serverConfig.geoCountry)?.toUpperCase() ?? null;
  const initial =
    [config.country?.toUpperCase(), geo].find((code): code is string => !!code && options.includes(code)) ??
    options[0];

  useEffect(() => {
    if (!selected && initial) store.getState().setCountryAuto(initial);
  }, [selected, initial, store]);

  return (
    <CountrySummarySelect
      countries={options}
      value={selected ?? initial ?? null}
      label={t('selectDocument.country.label')}
      geoCountry={geo}
      onPick={(code) => {
        if (code !== store.getState().selectedCountry) store.getState().setCountry(code);
      }}
      copy={{
        placeholder: t('selectDocument.country.placeholder'),
        change: t('selectDocument.country.change'),
        choose: t('selectDocument.country.choose'),
        search: t('selectDocument.country.search'),
        noMatches: t('selectDocument.country.noResults'),
        selected: t('selectDocument.country.selected'),
        yourLocation: t('selectDocument.country.yourLocation'),
      }}
    />
  );
}
