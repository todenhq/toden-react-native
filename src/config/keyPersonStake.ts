// Which key people must state their stake. Mirrors the web SDK's
// lib/key-person-stake.ts and the server's key-people/ownership.ts: keep the
// three in lockstep.
//
// Who is a beneficial owner, and so who must complete a full identity check,
// is decided from the stake. A shareholder or beneficial owner left without
// one would be filed as an ordinary shareholder, so by default each must give
// a percentage; a company's declared owners too. Directors and signatories
// are not asked. A workflow turns this off with
// `keyPeople.requireOwnership: false`.
import type { KeyPersonEntry } from './keyPeople';
import type { KeyPersonRole, WorkflowBusinessConfig } from '../types/business';

const NEEDS_STAKE: ReadonlySet<KeyPersonRole> = new Set(['shareholder', 'beneficial_owner']);

/** Whether the workflow asks the applicant for stakes (absent = yes). */
export function keyPeopleRequireOwnership(business: WorkflowBusinessConfig | undefined): boolean {
  const kp = business?.keyPeople;
  return Boolean(kp?.enabled && kp.collect) && kp?.requireOwnership !== false;
}

const filled = (pct: string) => pct.trim() !== '' && Number.isFinite(Number(pct));

/** Whether THIS row's roles mean it owes a percentage. */
export function rowNeedsStake(row: Pick<KeyPersonEntry, 'role' | 'roles'>): boolean {
  const roles = row.roles && row.roles.length > 0 ? row.roles : [row.role];
  return roles.some((r) => NEEDS_STAKE.has(r));
}

/**
 * Whether the row is missing a stake the workflow requires: an owner role with
 * no percentage, or a company's declared owner (named) with none.
 */
export function rowMissingStake(row: KeyPersonEntry, stakeRequired: boolean): boolean {
  if (!stakeRequired) return false;
  if (rowNeedsStake(row) && !filled(row.ownershipPct)) return true;
  if (!row.isCorporate) return false;
  return (row.owners ?? []).some((o) => o.name.trim().length >= 2 && !filled(o.ownershipPct));
}
