import { describeInMonorepo, readPackageFile as read } from './helpers/monorepo';
import {
  keepReadingSummary,
  OWNERSHIP_PENDING_STEP_NOTE,
  OWNERSHIP_PENDING_SUBMITTED_NOTE,
  ownershipNoteSection,
  selectOwnershipPending,
  summaryOwnershipPending,
} from '../config/ownershipPending';

// ─── Shareholders the register has not sent yet ──────────────────────────────
//
// A register read through Didit can take minutes to send the shareholders; the
// server adds them to the application when they arrive. A missing field is an
// older server and reads as false.

describe('shareholders still on their way', () => {
  it('reads ownershipPending off the register check, missing as false', () => {
    expect(selectOwnershipPending({ ownershipPending: true })).toBe(true);
    expect(selectOwnershipPending({ ownershipPending: false })).toBe(false);
    expect(selectOwnershipPending({})).toBe(false);
    expect(selectOwnershipPending(null)).toBe(false);
    expect(selectOwnershipPending(undefined)).toBe(false);
    expect(selectOwnershipPending({ ownershipPending: 'true' })).toBe(false);
  });

  it('reads keyPeopleOwnershipPending off the summary, missing as false', () => {
    expect(summaryOwnershipPending({ keyPeopleOwnershipPending: true })).toBe(true);
    expect(summaryOwnershipPending({ keyPeopleOwnershipPending: false })).toBe(false);
    expect(summaryOwnershipPending({})).toBe(false);
    expect(summaryOwnershipPending(null)).toBe(false);
  });

  it('keeps re-reading while anybody owes a check or owners are still coming', () => {
    const done = [{ status: 'verified' }, { status: 'not_needed' }];
    expect(keepReadingSummary(done, false)).toBe(false);
    expect(keepReadingSummary(done, true)).toBe(true);
    expect(keepReadingSummary([], true)).toBe(true);
    expect(keepReadingSummary([{ status: 'pending' }], false)).toBe(true);
    expect(keepReadingSummary([{ status: 'submitted' }], false)).toBe(true);
    expect(keepReadingSummary([{ status: 'failed' }], false)).toBe(true);
  });

  it('puts the step note in Shareholders, else Beneficial owners, else nowhere', () => {
    expect(ownershipNoteSection(['ubos', 'shareholders', 'representatives'])).toBe('shareholders');
    expect(ownershipNoteSection(['ubos', 'representatives'])).toBe('ubos');
    expect(ownershipNoteSection(['representatives'])).toBe(null);
  });

  it('words the notes in UK English without em dashes', () => {
    for (const text of [OWNERSHIP_PENDING_STEP_NOTE, OWNERSHIP_PENDING_SUBMITTED_NOTE]) {
      expect(text).not.toContain('—');
    }
  });
});

describeInMonorepo('the notes match the web SDK word for word', () => {
  it('uses the web catalogue defaults', () => {
    const web =
      read('sdk-react/src/i18n/groups/keyPeople-step.ts') +
      read('sdk-react/src/i18n/groups/keyPeople-await.ts');
    expect(web).toContain(OWNERSHIP_PENDING_STEP_NOTE);
    expect(web).toContain(OWNERSHIP_PENDING_SUBMITTED_NOTE);
  });
});
