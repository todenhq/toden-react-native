import React, { useMemo } from 'react';

import { useFlowState, useVerificationConfig } from '../components/runtime';
import { CountrySummarySelect } from '../components/CountrySummarySelect';
import { inferredCountry } from '../lib/inferred-country';
import { poaOfferedCountries } from '../lib/poa-country-gate';
import { useText } from '../i18n/useText';

// ---------------------------------------------------------------------------
// The Proof of Address step's country control, on every scope (the Didit PoA
// model: the applicant names where the document is from, then uploads it).
// The step owns the value and what a pick does (lib/poa-country-gate.ts): on
// the address scope the pick is the flow's declared country, which also drives
// the search filter, the map's opening view and the submission's country;
// elsewhere it is the proof of address's own country, which need not be the
// ID's. Mirrors the web SDK's steps/address/AddressCountryControl.
//
// It offers the org's accepted list (proofOfAddress.countries, the server
// refuses submissions outside it), else the whole world, in the shared summary
// row (components/CountrySummarySelect.tsx), as the combined ID step picks its
// country. The inferred country (server geo first, device locale second) is
// pinned in its list as "Your location".
// ---------------------------------------------------------------------------

/** Kept here for the callers that imported it from this file. */
export { poaOfferedCountries };

export function AddressCountryControl({
  value,
  onPick,
  label,
}: {
  value: string | null;
  onPick: (code: string) => void;
  label: string;
}): React.ReactElement {
  const config = useVerificationConfig();
  const t = useText();
  const geo = useFlowState((s) => s.serverConfig.geoCountry);
  const offered = useMemo(
    () => poaOfferedCountries(config.proofOfAddress?.countries),
    [config.proofOfAddress?.countries],
  );
  return (
    <CountrySummarySelect
      countries={offered}
      value={value}
      onPick={onPick}
      label={label}
      geoCountry={inferredCountry(geo)}
      copy={{
        placeholder: t('proofOfAddress.country.placeholder'),
        change: t('proofOfAddress.country.change'),
        choose: t('proofOfAddress.country.choose'),
        search: t('proofOfAddress.country.search'),
        noMatches: t('proofOfAddress.country.noMatches'),
        selected: t('proofOfAddress.country.selected'),
        yourLocation: t('proofOfAddress.country.yourLocation'),
      }}
    />
  );
}
