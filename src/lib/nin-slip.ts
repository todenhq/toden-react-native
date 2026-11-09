// ---------------------------------------------------------------------------
// The NIN slip is NIN read from paper (kyc-core and the builder merged them,
// 2026-11-07): a workflow offers one or the other, as the builder's NIN Slip
// switch says. A workflow built before the merge may list both; then only the
// slip is offered, as the builder now reads that workflow, so the picker never
// shows "NIN" beside "NIN (Slip)". Mirrors the web SDK's lib/nin-slip.ts.
// ---------------------------------------------------------------------------

/** One country's ID list without NIN when its slip is on offer (NG only). */
export function withoutNinBesideSlip<T extends { key: string }>(country: string, types: T[]): T[] {
  if (country.toUpperCase() !== 'NG' || !types.some((t) => t.key === 'nin-slip')) return types;
  return types.filter((t) => t.key !== 'nin');
}

/** The same rule over served rows, which carry many countries at once. */
export function withoutNinBesideSlipRows<T extends { country: string; idType: string }>(rows: T[]): T[] {
  const slip = rows.some((r) => r.country.toUpperCase() === 'NG' && r.idType === 'nin-slip');
  return slip ? rows.filter((r) => !(r.country.toUpperCase() === 'NG' && r.idType === 'nin')) : rows;
}
