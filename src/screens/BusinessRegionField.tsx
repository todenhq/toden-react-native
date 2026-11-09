import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { UiSelect } from '../components/UiSelect';
import { UiText } from '../components/Typography';
import { useVerificationStore } from '../components/runtime';
import { spacing } from '../config/theme';

// ---------------------------------------------------------------------------
// The registry region, for the countries that file companies per state or
// emirate (the US, India, Canada, the UAE). Shared by the name search and by
// registration-number entry when the workflow offers no search: the register is
// asked ONE region at a time, so the number alone does not name a company
// there. Mirrors the web SDK's components/BusinessRegionField.tsx.
// ---------------------------------------------------------------------------

export type BusinessRegion = { code: string; name: string };

/** The country's registry regions; empty when it has a single register. */
export function useBusinessRegions(country: string): BusinessRegion[] {
  const store = useVerificationStore();
  const [regions, setRegions] = useState<BusinessRegion[]>([]);
  useEffect(() => {
    let cancelled = false;
    setRegions([]);
    if (!country) return undefined;
    store
      .getState()
      .api.businessRegions(country)
      .then((r) => {
        if (!cancelled) setRegions(r.regions ?? []);
      })
      // An empty list means "do not ask", which is also the safe answer when
      // the catalogue is unreachable: the register says so on its own.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [country, store]);
  return regions;
}

export function BusinessRegionField({
  regions,
  region,
}: {
  regions: BusinessRegion[];
  region: string | null | undefined;
}): React.ReactElement | null {
  const store = useVerificationStore();
  if (regions.length === 0) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      <UiText variant="label" style={{ marginBottom: spacing.sm }}>
        State or region of registration
      </UiText>
      <UiSelect
        value={region || undefined}
        sheetTitle="State or region"
        searchable
        options={regions.map((r) => ({ value: r.code, label: r.name }))}
        onChange={(code) => store.getState().setBusinessField('subdivisionCode', code)}
      />
    </View>
  );
}
