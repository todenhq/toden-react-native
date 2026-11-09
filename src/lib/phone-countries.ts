// ---------------------------------------------------------------------------
// The phone field's dial-code countries: the workflow's choice
// (`phoneVerification.countries`, ISO-2; absent or empty offers every
// country). Pure. Mirrors the web SDK's PhoneNumberInput (fee6c537).
// ---------------------------------------------------------------------------

/** The field's own fallback country when nothing else decides. */
export const PHONE_FALLBACK_COUNTRY = 'NG';

/** PURE. The options on offer: every one, or only the workflow's. */
export function offeredPhoneOptions<T extends { code: string }>(all: readonly T[], countries?: readonly string[]): T[] {
  if (!countries?.length) return [...all];
  const only = new Set(countries.map((c) => c.toUpperCase()));
  return all.filter((o) => only.has(o.code));
}

/**
 * PURE. Where the field starts: the seed (a supplied number's country, else
 * the default) when it is on offer, else the fallback when that is, else the
 * first country offered.
 */
export function startingPhoneCountry(seed: string, offered: ReadonlyArray<{ code: string }>): string {
  const on = (code: string): boolean => offered.some((o) => o.code === code);
  if (on(seed)) return seed;
  if (on(PHONE_FALLBACK_COUNTRY)) return PHONE_FALLBACK_COUNTRY;
  return offered[0]?.code ?? PHONE_FALLBACK_COUNTRY;
}
