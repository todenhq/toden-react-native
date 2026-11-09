import { ALL_REGION_CODES } from '../config/regions';

// ---------------------------------------------------------------------------
// The Proof of Address step's country: where the document is from.
//
// Every scope asks for it (user decision 2026-11-07). Before, only the address
// scope did and every other flow read the document against the ID's country,
// but people live outside the country that issued their ID. Outside the
// address scope the ID's country is offered as the starting answer, since it
// is usually right, and the applicant can change it. On the address scope the
// declared country (`selectedCountry`) is the answer, and the scope seeds none.
// An org that accepts exactly ONE country has the control show it as a
// settled fact. Continue holds until there is a country (2026-09-08).
//
// A THREE-WAY MIRROR of the web SDK's lib/poa-country-gate.ts and Flutter's
// config/poa_country_gate.dart; change the rule in one and change all three.
// ---------------------------------------------------------------------------

/** What the picker offers: the org's accepted list, else every country. */
export function poaOfferedCountries(configured: readonly string[] | undefined): string[] {
  const list = (configured ?? [])
    .map((c) => c.toUpperCase())
    .filter((c) => ALL_REGION_CODES.includes(c));
  return list.length > 0 ? list : ALL_REGION_CODES;
}

/** The proof of address's country, or null while there is none to read the
 *  document against (Continue holds on null). */
export function poaCountryOf(facts: {
  scope: string | null;
  /** The address scope's declared country; elsewhere the ID's country. */
  selectedCountry: string | null | undefined;
  /** The country picked on the PoA step (outside the address scope). */
  poaCountry: string | null | undefined;
  /** The flow's own country, the ID's, offered as the starting answer. */
  idCountry: string | null | undefined;
  offered: readonly string[];
}): string | null {
  if (facts.offered.length === 1) return facts.offered[0]!;
  const clean = (code: string | null | undefined): string | null => code?.trim().toUpperCase() || null;
  if (facts.scope === 'address') return clean(facts.selectedCountry);
  const picked = clean(facts.poaCountry);
  if (picked) return picked;
  const id = clean(facts.idCountry);
  return id && facts.offered.includes(id) ? id : null;
}
