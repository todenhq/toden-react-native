import { readFileSync } from 'fs';
import { join } from 'path';

import { VerificationApiError, createVerificationApi } from '../services/api';
import { mapToVerificationError } from '../services/errors';
import { WORKFLOW_KEYS, mergeWorkflowConfig, overlayApplicantWorkflow } from '../config/workflowMerge';
import {
  LIVENESS_ATTEMPTS_EXCEEDED,
  attemptsLeftLine,
  countsAsFailedCheck,
  livenessAttemptLimit,
  readLivenessFailed,
} from '../lib/liveness-attempts';
import { reportLivenessFailure } from '../lib/liveness-failure-report';
import {
  DECLINED_TITLES,
  DEFAULT_LIVENESS_DECLINED_MESSAGE,
  declinedScreenCopy,
} from '../lib/session-declined';

// ─── A limit on liveness attempts ─────────────────────────────────────────────
//
// A workflow's `maxLivenessAttempts` (1 to 3): each failed check is reported to
// POST /liveness/failed, the panel says how many attempts are left, and at the
// limit the server declines the session (409 session_declined, reason
// liveness_attempts_exceeded) and the flow ends on the declined screen.

const SERVER_MESSAGE = 'The face check failed too many times.';
const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the attempts-left line', () => {
  it('says how many attempts are left, singular and plural', () => {
    expect(attemptsLeftLine({ limited: true, attemptsLeft: 1 })).toBe('1 attempt left.');
    expect(attemptsLeftLine({ limited: true, attemptsLeft: 2 })).toBe('2 attempts left.');
  });

  it('says nothing with no limit, none left, or no answer', () => {
    expect(attemptsLeftLine({ limited: false })).toBeNull();
    expect(attemptsLeftLine({ limited: true, attemptsLeft: 0 })).toBeNull();
    expect(attemptsLeftLine(null)).toBeNull();
  });

  // The line was once joined to the red message and drawn in its colour. It
  // is its own small warning now (screens/liveness/AttemptsLeftNotice), the
  // same notice as Flutter's and the web's.
  it('shows under the failure message as a small warning, not in its red', () => {
    const step = read('screens/LivenessStep.tsx');
    expect(step).toContain('message: livenessFailureMessage(liveness.failureReason),');
    expect(step).toContain('note: attemptsLeftLine(attempts),');

    const live = read('screens/liveness/LivenessLive.tsx');
    expect(live).toMatch(/\{failure\.message\}\s*<\/UiText>\s*\{failure\.note \? <AttemptsLeftNotice text=\{failure\.note\} \/> : null\}/);

    const notice = read('screens/liveness/AttemptsLeftNotice.tsx');
    expect(notice).toContain('name="triangle-alert"');
    expect(notice).toContain('backgroundColor: colors.warningBg');
    expect(notice).toContain('color={colors.textDark}');
    expect(notice).not.toContain('colors.error');
    // The glyph is decorative; the words are what a screen reader reads.
    expect(notice).toMatch(/accessibilityElementsHidden importantForAccessibility="no-hide-descendants">\s*<Icon/);
  });
});

describe('what counts', () => {
  it('reports only a failed check, never a camera that did not start', () => {
    for (const reason of ['timeout', 'face_lost', 'face_swap', 'flash_failed'] as const) {
      expect(countsAsFailedCheck(reason)).toBe(true);
    }
    expect(countsAsFailedCheck('no_camera')).toBe(false);
    expect(countsAsFailedCheck('load_error')).toBe(false);
    expect(countsAsFailedCheck(null)).toBe(false);
  });

  it('reads 1 to 3, is off only for false, and is 3 otherwise', () => {
    expect(livenessAttemptLimit(3)).toBe(3);
    expect(livenessAttemptLimit(1)).toBe(1);
    expect(livenessAttemptLimit(5)).toBe(3);
    expect(livenessAttemptLimit(false)).toBeNull();
    expect(livenessAttemptLimit(undefined)).toBe(3);
    expect(livenessAttemptLimit(0)).toBe(3);
    expect(livenessAttemptLimit(1.5)).toBe(3);
    expect(livenessAttemptLimit('2')).toBe(3);
  });
});

describe('reading the answer', () => {
  it('maps the server shapes', () => {
    expect(readLivenessFailed({ limited: false })).toEqual({ limited: false });
    expect(readLivenessFailed({ limited: true, attemptsLeft: 2 })).toEqual({ limited: true, attemptsLeft: 2 });
    expect(readLivenessFailed({ limited: true, attemptsLeft: 0 })).toEqual({ limited: true, attemptsLeft: 0 });
  });

  it('reads anything unexpected as no limit, or nothing left to say', () => {
    expect(readLivenessFailed(null)).toEqual({ limited: false });
    expect(readLivenessFailed('ok')).toEqual({ limited: false });
    expect(readLivenessFailed({})).toEqual({ limited: false });
    expect(readLivenessFailed({ limited: true })).toEqual({ limited: true, attemptsLeft: 0 });
    expect(readLivenessFailed({ limited: true, attemptsLeft: -1 })).toEqual({ limited: true, attemptsLeft: 0 });
  });
});

describe('the declined screen for used-up face checks', () => {
  const liveness = { reasonCode: LIVENESS_ATTEMPTS_EXCEEDED, channel: null };

  it("says the face could not be verified, with the server's message", () => {
    expect(declinedScreenCopy({ ...liveness, message: SERVER_MESSAGE })).toEqual({
      title: "We couldn't verify your face",
      body: SERVER_MESSAGE,
    });
  });

  it('falls back to its own sentence', () => {
    expect(declinedScreenCopy({ ...liveness, message: null }).body).toBe(
      'The face check did not succeed in the attempts allowed, so this verification has ended. Contact the organisation that sent it if you need help.',
    );
  });

  it('wins over a contact channel the store guessed from the step', () => {
    expect(declinedScreenCopy({ ...liveness, message: null, channel: 'email' }).title).toBe(DECLINED_TITLES.face);
  });

  it('never carries an em dash', () => {
    expect(`${DECLINED_TITLES.face} ${DEFAULT_LIVENESS_DECLINED_MESSAGE}`).not.toContain('—');
  });
});

describe('the API call', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const answer = (status: number, body: unknown) => {
    const mock = jest.fn(async () => new Response(JSON.stringify(body), { status }));
    global.fetch = mock as unknown as typeof fetch;
    return mock;
  };

  it('posts the session and country to /liveness/failed and returns the typed answer', async () => {
    const mock = answer(200, { limited: true, attemptsLeft: 2 });
    const api = createVerificationApi('https://api.example', 'pk_test_x');
    await expect(api.livenessFailed({ sessionId: 'ses_1', country: 'GH' })).resolves.toEqual({
      limited: true,
      attemptsLeft: 2,
    });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example/api/v1/liveness/failed');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ sessionId: 'ses_1', country: 'GH' });
  });

  it('answers no limit as no limit', async () => {
    answer(200, { limited: false });
    const api = createVerificationApi('https://api.example', 'pk_test_x');
    await expect(api.livenessFailed({})).resolves.toEqual({ limited: false });
  });

  it('surfaces a decline as the contact calls do: a thrown refusal the client hears', async () => {
    answer(409, { error: 'session_declined', reasonCode: LIVENESS_ATTEMPTS_EXCEEDED, message: SERVER_MESSAGE });
    const onRefusal = jest.fn();
    const api = createVerificationApi('https://api.example', 'pk_test_x', { onRefusal });
    const err = await api.livenessFailed({ sessionId: 'ses_1' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerificationApiError);
    expect((err as VerificationApiError).code).toBe('session_declined');
    expect(onRefusal).toHaveBeenCalledTimes(1);
    const mapped = mapToVerificationError(err, 'verify');
    expect(mapped.code).toBe('session_declined');
    expect(mapped.message).toBe(SERVER_MESSAGE);
  });
});

describe('reporting a failure', () => {
  const deps = (livenessFailed: jest.Mock) => {
    const markDeclined = jest.fn();
    return { markDeclined, run: () => reportLivenessFailure({ livenessFailed, markDeclined, sessionId: 'ses_1', country: 'NG' }) };
  };

  it('passes the answer through, sending only what it has', async () => {
    const livenessFailed = jest.fn(async () => ({ limited: true as const, attemptsLeft: 1 }));
    const { run, markDeclined } = deps(livenessFailed);
    await expect(run()).resolves.toEqual({ limited: true, attemptsLeft: 1 });
    expect(livenessFailed).toHaveBeenCalledWith({ sessionId: 'ses_1', country: 'NG' });
    expect(markDeclined).not.toHaveBeenCalled();

    const bare = jest.fn(async () => ({ limited: false as const }));
    await reportLivenessFailure({ livenessFailed: bare, markDeclined, sessionId: null, country: undefined });
    expect(bare).toHaveBeenCalledWith({});
  });

  it('marks the session declined at the limit, and shows nothing more', async () => {
    const refusal = new VerificationApiError(SERVER_MESSAGE, 409, 'session_declined', {
      error: 'session_declined',
      reasonCode: LIVENESS_ATTEMPTS_EXCEEDED,
      message: SERVER_MESSAGE,
    });
    const { run, markDeclined } = deps(jest.fn(async () => Promise.reject(refusal)));
    await expect(run()).resolves.toBeNull();
    expect(markDeclined).toHaveBeenCalledWith({ message: SERVER_MESSAGE, reasonCode: LIVENESS_ATTEMPTS_EXCEEDED });
  });

  it('ignores a network error or any other failure, so Try Again works as before', async () => {
    for (const failure of [new TypeError('Network request failed'), new VerificationApiError('x', 500)]) {
      const { run, markDeclined } = deps(jest.fn(async () => Promise.reject(failure)));
      await expect(run()).resolves.toBeNull();
      expect(markDeclined).not.toHaveBeenCalled();
    }
  });
});

describe('the workflow setting', () => {
  it('rides the workflow keys, so a published flow sets it', () => {
    expect(WORKFLOW_KEYS as readonly string[]).toContain('maxLivenessAttempts');
    expect(mergeWorkflowConfig({ maxLivenessAttempts: 2 }, {} as Record<string, unknown>).maxLivenessAttempts).toBe(2);
    expect(mergeWorkflowConfig({ maxLivenessAttempts: 1 }, { maxLivenessAttempts: 3 }).maxLivenessAttempts).toBe(1);
  });

  it("follows a mapped applicant workflow's own limit on the KYB applicant leg", () => {
    const out = overlayApplicantWorkflow(
      { id: 'wf_applicant', config: { maxLivenessAttempts: 3 } },
      {} as Record<string, unknown>,
    );
    expect(out.maxLivenessAttempts).toBe(3);
  });
});
