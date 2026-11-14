import { VerificationApiError } from '../services/api';
import { CODE_USED_UP_MESSAGE, isCodeUsedUp } from '../services/contactErrors';
import {
  INITIAL_CODE_ENTRY,
  codeEntryReducer,
  type CodeEntryEvent,
  type CodeEntryState,
} from '../lib/contact-code-state';

// ─── A used-up code ───────────────────────────────────────────────────────────
//
// /contact/check answers a wrong code with 400 { error: 'invalid_code',
// attemptsRemaining }. At 0 the code is spent, and any further check on it is
// 429 { error: 'too_many_attempts' }. Either signal disables the field until a
// new code is actually sent; a wrong code with attempts left behaves as before.

const wrong = (attemptsRemaining: number) =>
  new VerificationApiError('That code is not correct.', 400, 'invalid_code', {
    error: 'invalid_code',
    attemptsRemaining,
  });
const tooMany = () =>
  new VerificationApiError('Too many attempts', 429, 'too_many_attempts', { error: 'too_many_attempts' });

const run = (events: CodeEntryEvent[], from: CodeEntryState = INITIAL_CODE_ENTRY): CodeEntryState =>
  events.reduce(codeEntryReducer, from);

describe('isCodeUsedUp', () => {
  it('reads both signals', () => {
    expect(isCodeUsedUp(wrong(0))).toBe(true);
    expect(isCodeUsedUp(tooMany())).toBe(true);
  });

  it('leaves a wrong code with attempts left, and everything else, alone', () => {
    expect(isCodeUsedUp(wrong(2))).toBe(false);
    expect(isCodeUsedUp(new VerificationApiError('x', 400, 'invalid_code', { error: 'invalid_code' }))).toBe(false);
    expect(isCodeUsedUp(new VerificationApiError('x', 400, 'challenge_expired'))).toBe(false);
    expect(isCodeUsedUp(new TypeError('Network request failed'))).toBe(false);
    expect(isCodeUsedUp(null)).toBe(false);
  });
});

describe('code entry', () => {
  it('a wrong code with attempts left clears the code and counts down, field still on', () => {
    const s = run([{ type: 'typed', code: '123456' }, { type: 'request' }, { type: 'checkFailed', err: wrong(2) }]);
    expect(s).toEqual({
      code: '',
      usedUp: false,
      error: 'That code is not correct. Please try again.',
      attemptsLeft: 2,
    });
    expect(codeEntryReducer(s, { type: 'typed', code: '1' }).code).toBe('1');
  });

  it('attemptsRemaining 0 uses the code up, with the existing message and no count', () => {
    const s = run([{ type: 'typed', code: '123456' }, { type: 'checkFailed', err: wrong(0) }]);
    expect(s).toEqual({ code: '', usedUp: true, error: CODE_USED_UP_MESSAGE, attemptsLeft: undefined });
    expect(CODE_USED_UP_MESSAGE).toBe('Too many incorrect attempts. Request a new code.');
  });

  it('too_many_attempts uses the code up the same way', () => {
    const s = run([{ type: 'checkFailed', err: tooMany() }]);
    expect(s.usedUp).toBe(true);
    expect(s.error).toBe(CODE_USED_UP_MESSAGE);
  });

  it('a used-up code takes no typing, paste or autofill', () => {
    const s = run([{ type: 'checkFailed', err: wrong(0) }, { type: 'typed', code: '654321' }]);
    expect(s.code).toBe('');
    expect(s.usedUp).toBe(true);
  });

  it('stays used up when sending the new code fails', () => {
    const s = run([
      { type: 'checkFailed', err: tooMany() },
      { type: 'request' },
      { type: 'sendFailed', message: 'Too many codes requested. Please wait a while and try again.' },
    ]);
    expect(s.usedUp).toBe(true);
    expect(s.error).toBe('Too many codes requested. Please wait a while and try again.');
  });

  it('is re-enabled, and cleared, once a new code is sent', () => {
    const s = run([
      { type: 'checkFailed', err: wrong(0) },
      { type: 'request' },
      { type: 'sent' },
    ]);
    expect(s).toEqual(INITIAL_CODE_ENTRY);
    expect(codeEntryReducer(s, { type: 'typed', code: '12' }).code).toBe('12');
  });
});
