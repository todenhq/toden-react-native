// ---------------------------------------------------------------------------
// Where the applicant picks the country that issued their ID, on a flow that
// offers more than one (user decision 2026-11-07, a builder Advanced setting):
//
//  - `combined` (the default): the country summary row at the top of the
//    ID-type step, the IDs for that country beneath it. One step.
//  - `separate`: a country step of its own, then the ID types. Two steps, the
//    layout before this setting existed.
//
// Mirrors the web SDK's lib/id-selection-layout.ts and kyc-core's
// `idSelectionLayout` in the workflow config schema.
// ---------------------------------------------------------------------------

export type IdSelectionLayout = 'combined' | 'separate';

/** Whether the country is picked on the ID-type step rather than a step of its own. */
export function countryOnIdStep(config: { idSelectionLayout?: IdSelectionLayout }): boolean {
  return config.idSelectionLayout !== 'separate';
}
