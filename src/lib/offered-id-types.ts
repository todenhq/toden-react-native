import { withoutUnchosenIdTypes } from './chosen-only-ids';
import { isRetiredIdType } from './retired-id-types';
import { withoutNinBesideSlipRows } from './nin-slip';

// ---------------------------------------------------------------------------
// The served ID rows this flow may OFFER: never a retired type (BVN Premium,
// lib/retired-id-types.ts), and on a workflow mount never a chosen-only ID the
// workflow does not list (lib/chosen-only-ids.ts), and never NG's NIN beside
// its slip (lib/nin-slip.ts). Mirrors the web SDK's `servedConfig` in
// context/VerificationConfigContext.tsx and the filters in its IdTypeStep.
//
// Applied where the flow offers IDs (the picker, the country list, the
// multi-ID plan), not where it looks one up: a run already holding a retired
// type still finds its own row and features.
// ---------------------------------------------------------------------------

interface OfferConfig {
  workflowId?: string | null;
  country?: string | null;
  idTypes?: readonly string[] | null;
  countries?: ReadonlyArray<{ country: string; idTypes?: readonly string[] | null }> | null;
}

export function offeredIdTypeRows<T extends { country: string; idType: string }>(
  rows: T[],
  config: OfferConfig,
): T[] {
  const live = rows.filter((row) => !isRetiredIdType(row.country, row.idType));
  return withoutNinBesideSlipRows(config.workflowId ? withoutUnchosenIdTypes(live, config) : live);
}
