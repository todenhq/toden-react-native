// MIRRORS the web SDK's lib/app-country.ts. Keep the two in lockstep.
//
// The country an app passes (`country`), on a flow that verifies IDs from
// several.
//
// A workflow's own countries win over the app's props, so on a multi-country
// workflow the `country` prop used to be ignored: the picker opened on the
// workflow's own country, else on the visitor's location. An app that already
// knows its user's country had no way to say so. Now, when the flow offers the
// country the app passed, the picker opens on it; with `lockCountry` there is
// no picker and the flow runs as if it offered that country alone (user
// decision 2026-11-21: one `country` prop, not a second one beside it).
//
// The app's country only ever chooses among the countries the flow offers. One
// the flow does not offer changes nothing (the picker shows as usual), since
// the server would refuse an ID from it anyway. A single-country flow has
// nothing to choose: there `country` stays what it always was, the flow's own.
//
// Pure. Applied once, where the props and the workflow become the flow's
// config (services/workflowGate.ts), so every step reads the result.

/** What the rule reads from, and writes to, a flow's config. */
export interface AppCountryConfig {
  country?: string;
  countries?: Array<{ country: string }>;
  lockCountry?: boolean;
  /** Set here: the offered country the app passed, for the country step to mark and list first. */
  appCountry?: string;
}

/** The country the app passed as the flow spells it; null when it passed none or one the flow does not offer. */
function offeredCountry(config: AppCountryConfig, appCountry: string | undefined): string | null {
  const wanted = appCountry?.trim().toUpperCase();
  if (!wanted) return null;
  return config.countries?.find((c) => c.country.toUpperCase() === wanted)?.country ?? null;
}

/**
 * The flow's config with the app's own `country` applied: made the country the
 * picker opens on, or, when locked, the only country the flow offers.
 * `appCountry` is the app's prop as passed, before any workflow replaced it. A
 * flow with one country, or a country it does not offer, comes back unchanged.
 */
export function applyAppCountry<P extends AppCountryConfig>(config: P, appCountry: string | undefined): P {
  if ((config.countries?.length ?? 0) <= 1) return config;
  const country = offeredCountry(config, appCountry);
  if (!country) return config;
  if (!config.lockCountry) return { ...config, country, appCountry: country };
  return { ...config, country, appCountry: country, countries: config.countries!.filter((c) => c.country === country) };
}

/**
 * Whether a country picked earlier can still be used. A flow that lists its
 * countries must still offer it; a flow that lists none (the app's own
 * `country`, or a KYB applicant leg offering every granted country) takes any.
 *
 * Asked when a saved session is resumed: a pick made before the app named or
 * locked another country would otherwise come back and win over the lock
 * (2026-11-21: a flow locked to South Africa resumed into the country picked
 * the day before, with no picker to change it).
 */
export function stillOffered(country: string, config: { countries?: Array<{ country: string }> }): boolean {
  const offered = config.countries ?? [];
  const wanted = country.trim().toUpperCase();
  return offered.length === 0 || offered.some((c) => c.country.toUpperCase() === wanted);
}
