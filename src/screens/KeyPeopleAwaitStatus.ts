import { KEY_PERSON_ROLE_LABELS } from '../config/keyPeople';
import type { useTheme } from '../components/runtime';
import type { AwaitRow } from './KeyPeopleAwaitList';

// How an awaiting person's role and status read on their card. Split from
// KeyPeopleAwaitCard per the 200-line rule.

export const ROLE_LABELS: Record<string, string> = {
  ...KEY_PERSON_ROLE_LABELS,
  authorized_representative: 'Authorized representative',
};

export function statusView(
  row: AwaitRow,
  colors: ReturnType<typeof useTheme>['colors'],
): { label: string; bg: string; fg: string } {
  switch (row.status) {
    case 'verified':
      return { label: 'VERIFIED', bg: colors.successBg, fg: colors.success };
    case 'submitted':
      return { label: 'SUBMITTED', bg: colors.successBg, fg: colors.success };
    case 'failed':
      return { label: 'CHECK FAILED', bg: colors.errorBg, fg: colors.error };
    case 'not_needed':
      return { label: 'NOT NEEDED', bg: colors.border, fg: colors.textMuted };
    default:
      return {
        label: row.isCorporate ? 'KYB PENDING' : 'KYC PENDING',
        bg: colors.primary100,
        fg: colors.primary,
      };
  }
}
