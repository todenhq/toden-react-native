import { useMemo } from 'react';

import { ID_TYPES, resolveIdTypeDefinition } from '../config/idTypes';
import { isRetiredIdType } from '../lib/retired-id-types';
import { withoutNinBesideSlip } from '../lib/nin-slip';
import { offeredIdTypeRows } from '../lib/offered-id-types';
import type { MultiIdPlan } from '../lib/multi-id';
import type { IdTypeDefinition, SupportedCountry } from '../types/config';
import { useFlowState, useVerificationConfig } from '../components/runtime';

// ---------------------------------------------------------------------------
// The IDs the ID-type step lists for `country`, after every narrowing: the
// workflow's per-country list, retired and unchosen types, Document
// Intelligence off, and a multi-ID run's safe picks. Split from IdTypeStep
// (200-line rule).
// ---------------------------------------------------------------------------

export function useIdTypeOptions(country: SupportedCountry, plan: MultiIdPlan | null): IdTypeDefinition[] {
  const config = useVerificationConfig();
  const serverConfig = useFlowState((s) => s.serverConfig);

  const available = useMemo<IdTypeDefinition[]>(() => {
    // In a multi-region flow the PICKED country's own `idTypes` narrow the
    // list; otherwise the top-level prop applies. Absent or empty means every
    // granted type, which is the server's own "unset = all" semantic.
    const perCountry = (config.countries ?? []).find(
      (e) => e.country.toUpperCase() === country.toUpperCase(),
    )?.idTypes;
    const keys = (perCountry?.length ? perCountry : config.idTypes) as
      | readonly string[]
      | undefined;
    const allowed = (key: string): boolean => !keys?.length || keys.includes(key);

    // Built from the SERVER rows, not the curated table. The curated table only
    // knows the five gov-DB countries; a Global-Documents flow offers ~240, and
    // filtering against the table rendered an empty list — "no ID types are
    // enabled" — for every country outside it. The row carries the label and
    // capture shape, so an uncurated country renders correctly from it.
    // Never a retired type, and on a workflow mount never a chosen-only ID the
    // workflow does not list (lib/offered-id-types.ts).
    if (serverConfig.status === 'ready') {
      return offeredIdTypeRows(serverConfig.idTypes, config)
        .filter((row) => row.country === country && allowed(row.idType))
        .map((row) =>
          resolveIdTypeDefinition(country, row.idType, {
            label: row.label,
            requiresDocumentCapture: row.requiresDocumentCapture,
            scanSides: row.scanSides,
            supportsNfc: row.supportsNfc,
          }),
        );
    }
    if (serverConfig.status === 'loading') return [];
    // Config failed to load: fall back to the curated list. The server still
    // rejects anything actually disabled, so this is permissive, not unsafe.
    const table = ID_TYPES as Record<string, readonly IdTypeDefinition[] | undefined>;
    // A retired type (BVN Premium, now BVN's premium option) is never offered,
    // even from this local list.
    return withoutNinBesideSlip(
      country,
      (table[country.toUpperCase()] ?? []).filter((t) => allowed(t.key) && !isRetiredIdType(country, t.key)),
    );
  }, [country, config, serverConfig]);

  // Document Intelligence off ⇒ number-only IDs only (there is no document
  // capture step), so drop every document-scanned ID from the picker. This is
  // what makes the disabled step actually disappear from the live flow rather
  // than still offering passports and licences that then have nowhere to be
  // captured. Mirrors the web SDK's IdTypeStep.
  const visible = useMemo<IdTypeDefinition[]>(() => {
    const base =
      config.enableDocumentCapture === false
        ? available.filter((t) => !t.requiresDocumentCapture)
        : available;
    // Multi-ID: only the picks that are still free AND leave every later check
    // an option. An ID already used earlier in the run is simply not offered.
    return plan ? base.filter((t) => plan.safeOptions.includes(t.key)) : base;
  }, [available, config.enableDocumentCapture, plan]);

  return visible;
}
