import { VerificationApiError } from '../services/api';
import { mapToVerificationError } from '../services/errors';
import { cancelledRefusalOf } from '../lib/session-cancelled';
import {
  CONTACT_ATTEMPTS_EXCEEDED,
  DECLINED_TITLES,
  DEFAULT_CONTACT_DECLINED_MESSAGE,
  DEFAULT_DECLINED_MESSAGE,
  declinedChannelForStep,
  declinedRefusalOf,
  declinedScreenCopy,
} from '../lib/session-declined';
import { createVerificationStore } from '../store/verificationStore';
import type { ResolvedVerificationConfig } from '../types/config';

// ─── A declined session ───────────────────────────────────────────────────────
//
// With `declineOnLastAttempt`, the last wrong code declines the session:
// /contact/check answers 409 { error: 'session_declined', reasonCode:
// 'contact_attempts_exceeded', message }, and every later request on the
// session answers the same. Parallel to session_cancelled: never a retry.

const SERVER_MESSAGE = 'The verification code was entered incorrectly too many times.';

const declined = (body: Record<string, unknown> = {
  error: 'session_declined',
  reasonCode: CONTACT_ATTEMPTS_EXCEEDED,
  message: SERVER_MESSAGE,
}) => new VerificationApiError(String(body.message ?? body.error), 409, 'session_declined', body);

describe('declinedRefusalOf', () => {
  it('reads the reason and the server message', () => {
    expect(declinedRefusalOf(declined())).toEqual({ message: SERVER_MESSAGE, reasonCode: CONTACT_ATTEMPTS_EXCEEDED });
  });

  it('keeps a missing or blank message as null, so the screen picks its default', () => {
    expect(declinedRefusalOf(declined({ error: 'session_declined', message: '  ' }))).toEqual({
      message: null,
      reasonCode: null,
    });
  });

  it('ignores every other failure, including other 409s and a cancellation', () => {
    expect(declinedRefusalOf(new VerificationApiError('c', 409, 'session_cancelled'))).toBeNull();
    expect(declinedRefusalOf(new VerificationApiError('used', 409, 'handoff_session_used'))).toBeNull();
    expect(declinedRefusalOf(new VerificationApiError('x', 429, 'too_many_attempts'))).toBeNull();
    expect(declinedRefusalOf(new TypeError('Network request failed'))).toBeNull();
    expect(declinedRefusalOf(null)).toBeNull();
    expect(cancelledRefusalOf(declined())).toBeNull();
  });
});

describe('the declined screen copy', () => {
  const contact = { reasonCode: CONTACT_ATTEMPTS_EXCEEDED, message: null };

  it('names the email or phone step the code was for', () => {
    expect(declinedScreenCopy({ ...contact, channel: 'email' }).title).toBe("We couldn't verify your email address");
    expect(declinedScreenCopy({ ...contact, channel: 'phone' }).title).toBe("We couldn't verify your phone number");
  });

  it('says the verification has ended when the channel is unknown', () => {
    expect(declinedScreenCopy({ ...contact, channel: null }).title).toBe('This verification has ended');
    expect(declinedScreenCopy({ reasonCode: 'something_else', message: null, channel: 'email' }).title).toBe(
      DECLINED_TITLES.unknown,
    );
  });

  it("shows the server's message when it sent one", () => {
    expect(declinedScreenCopy({ ...contact, message: SERVER_MESSAGE, channel: 'email' }).body).toBe(SERVER_MESSAGE);
  });

  it('falls back to the default sentence otherwise', () => {
    expect(declinedScreenCopy({ ...contact, channel: 'phone' }).body).toBe(
      'The code was entered incorrectly too many times, so this verification has ended. Contact the organisation that sent it if you need help.',
    );
    expect(declinedScreenCopy({ reasonCode: null, message: null, channel: null }).body).toBe(DEFAULT_DECLINED_MESSAGE);
  });

  it('never carries an em dash or a try again', () => {
    for (const text of [...Object.values(DECLINED_TITLES), DEFAULT_CONTACT_DECLINED_MESSAGE, DEFAULT_DECLINED_MESSAGE]) {
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/try again/i);
    }
  });

  it('reads the channel off the contact step on screen', () => {
    expect(declinedChannelForStep('email-verification')).toBe('email');
    expect(declinedChannelForStep('phone-verification')).toBe('phone');
    expect(declinedChannelForStep('liveness')).toBeNull();
  });
});

describe('mapToVerificationError', () => {
  it('maps a decline to its own code, in either context', () => {
    for (const context of ['verify', 'upload'] as const) {
      const e = mapToVerificationError(declined(), context);
      expect(e.code).toBe('session_declined');
      expect(e.message).toBe(SERVER_MESSAGE);
    }
  });

  it('never words a decline as something to try again', () => {
    const e = mapToVerificationError(declined({ error: 'session_declined', reasonCode: CONTACT_ATTEMPTS_EXCEEDED }), 'verify');
    expect(e.message).toBe(DEFAULT_CONTACT_DECLINED_MESSAGE);
  });
});

describe('the store learns of a decline from any request', () => {
  // The store starts timers of its own; fake them so none outlives the test.
  // Microtasks stay real: the fetch Response is read through them.
  beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
  afterAll(() => jest.useRealTimers());
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function answer(status: number, body: Record<string, unknown>): void {
    global.fetch = jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  }

  function makeStore() {
    return createVerificationStore({ apiKey: 'pk_test_x', country: 'NG', metadata: {} } as unknown as ResolvedVerificationConfig);
  }

  it('marks the run declined, naming the contact step on screen', async () => {
    const store = makeStore();
    store.setState({ currentStep: 'phone-verification' });
    answer(409, { error: 'session_declined', reasonCode: CONTACT_ATTEMPTS_EXCEEDED, message: SERVER_MESSAGE });
    await expect(store.getState().api.contactCheck({ challengeId: 'ch_1', code: '000000' })).rejects.toBeInstanceOf(
      VerificationApiError,
    );
    expect(store.getState().declined).toEqual({
      message: SERVER_MESSAGE,
      reasonCode: CONTACT_ATTEMPTS_EXCEEDED,
      channel: 'phone',
    });
  });

  it('leaves the channel unknown away from a contact step, and keeps the first refusal', async () => {
    const store = makeStore();
    store.setState({ currentStep: 'liveness' });
    answer(409, { error: 'session_declined', reasonCode: CONTACT_ATTEMPTS_EXCEEDED });
    await expect(store.getState().api.saveProgress('sess_1', {} as never)).rejects.toBeTruthy();
    expect(store.getState().declined).toEqual({ message: null, reasonCode: CONTACT_ATTEMPTS_EXCEEDED, channel: null });
    store.getState().markDeclined({ message: 'later', reasonCode: 'other' });
    expect(store.getState().declined?.message).toBeNull();
  });

  it('ignores every other refusal', async () => {
    const store = makeStore();
    answer(400, { error: 'invalid_code', attemptsRemaining: 0 });
    await expect(store.getState().api.contactCheck({ challengeId: 'ch_1', code: '000000' })).rejects.toBeTruthy();
    expect(store.getState().declined).toBeNull();
  });
});
