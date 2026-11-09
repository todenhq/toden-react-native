// ---------------------------------------------------------------------------
// ID types a workflow offers only when it lists them by name. Mirrors the web
// SDK's lib/chosen-only-ids.ts and kyc-core's src/lib/workflows/
// chosen-only-ids.ts (and the dashboard's copy): change them together.
//
// A workflow country with no ID list offers every ID the organisation holds
// EXCEPT these: they were added after most workflows were built, and verify
// less than the IDs beside them, so an org chooses them. The server already
// leaves them out of the list it serves a published workflow session; the
// SDK applies the same rule to any workflow mount, so a server that served
// the full grant list cannot put them back. A mount configured in code lists
// its own IDs and is not filtered.
// ---------------------------------------------------------------------------

const CHOSEN_ONLY_ID_TYPES: ReadonlySet<string> = new Set([
  'NG/phone-number',
  'NG/nin-phone',
  'NG/nin-slip',
  'NG/tax-id',
  'NG/vnin',
]);

type IdListConfig = {
  country?: string | null;
  idTypes?: readonly string[] | null;
  countries?: ReadonlyArray<{ country: string; idTypes?: readonly string[] | null }> | null;
};

/** The IDs a workflow lists for `country` (null when it lists none). */
function listedIdTypesFor(config: IdListConfig, country: string): readonly string[] | null {
  const entry = config.countries?.find((c) => c.country === country);
  if (entry) return entry.idTypes && entry.idTypes.length > 0 ? entry.idTypes : null;
  if (config.country === country && config.idTypes && config.idTypes.length > 0) return config.idTypes;
  return null;
}

/** The served rows without the chosen-only IDs the workflow does not list for their country. */
export function withoutUnchosenIdTypes<T extends { country: string; idType: string }>(
  rows: T[],
  config: IdListConfig,
): T[] {
  return rows.filter(
    (row) =>
      !CHOSEN_ONLY_ID_TYPES.has(`${row.country.toUpperCase()}/${row.idType}`) ||
      (listedIdTypesFor(config, row.country)?.includes(row.idType) ?? false),
  );
}
