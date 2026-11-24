// Embedded face re-authentication and enrolment with a scoped publishable key
// (user token design rev 4, sections 6a and 14): a fresh biometric token
// before /session/start, one fetch and retry on a workflow mount's
// `user_token_required`, a re-mount on /verify's `user_token_invalid`, and
// 4.4.0's request byte for byte with no provider.

jest.mock('../presence/fs', () => ({ readJsonFile: () => ({}), writeJsonFile: () => undefined }));
jest.mock('../services/fingerprint-sources', () => ({
  ...jest.requireActual('../services/fingerprint-sources'),
  persistentDeviceId: async () => 'dev_ref_1',
}));
jest.mock('../services/deviceMetadata', () => ({
  ...jest.requireActual('../services/deviceMetadata'),
  collectDeviceMetadata: () => ({ platform: 'ios' }),
}));
jest.mock(
  'expo-secure-store',
  () => {
    const items: Record<string, string> = {};
    return {
      __items: items,
      getItemAsync: jest.fn(async (key: string) => items[key] ?? null),
      setItemAsync: jest.fn(async (key: string, value: string) => {
        items[key] = value;
      }),
      deleteItemAsync: jest.fn(async (key: string) => {
        delete items[key];
      }),
    };
  },
  { virtual: true },
);

import { VerificationApiError } from '../services/api';
import { mountTokenHeaders, remountFixes, startWithMountToken } from '../services/mount-user-token';
import { remountAttemptSession } from '../store/session';
import { USER_TOKEN_HEADER, UserTokenError, resetUserTokens, setUserTokenProvider } from '../presence/user-token';
import '../presence/secure-token';

/* eslint-disable @typescript-eslint/no-require-imports */
const secure = require('expo-secure-store') as { __items: Record<string, string> };
/* eslint-enable @typescript-eslint/no-require-imports */

const apiKey = 'pk_test_abc';
const tokenOf = (c: string) => `ut_test_${c.repeat(43)}`;
const mint = (c: string, user = 'cus_123', purpose = 'biometric') => ({
  object: 'user_token',
  id: `utk_${c}`,
  token: tokenOf(c),
  purpose,
  externalUserId: user,
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  maxUses: 5,
});
const refusal = (code: string, status = 403) =>
  new VerificationApiError('refused', status, undefined, {
    error: { type: 'PERMISSION_ERROR', code, message: 'refused', request_id: null },
  });

let next: string[];
let provider: jest.Mock;

beforeEach(() => {
  resetUserTokens();
  next = ['A', 'B', 'C'];
  provider = jest.fn(async ({ purpose }: { purpose: string }) => mint(next.shift()!, 'cus_123', purpose));
});

describe('the mount', () => {
  it('with no provider sends no header, as 4.4.0 did', async () => {
    const start = jest.fn(async (headers: Record<string, string>) => headers);
    const sent = await startWithMountToken({ apiKey, scope: 'biometric-authentication' }, 'cus_123', start);
    expect(sent).toEqual({});
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('a face check fetches a fresh biometric token before the start, every time', async () => {
    const config = { apiKey, scope: 'biometric-authentication', getUserToken: provider };
    expect(await mountTokenHeaders(config, 'cus_123')).toEqual({ [USER_TOKEN_HEADER]: tokenOf('A') });
    expect(await mountTokenHeaders(config, 'cus_123')).toEqual({ [USER_TOKEN_HEADER]: tokenOf('B') });
    expect(provider).toHaveBeenNthCalledWith(1, { purpose: 'biometric' });
  });

  it('face enrolment needs one too', async () => {
    const config = { apiKey, scope: 'biometric-enrollment', getUserToken: provider };
    expect(await mountTokenHeaders(config, 'cus_123')).toEqual({ [USER_TOKEN_HEADER]: tokenOf('A') });
  });

  it('any other scope sends none, even with a provider', async () => {
    const config = { apiKey, scope: 'address', getUserToken: provider };
    expect(await mountTokenHeaders(config, 'cus_123')).toEqual({});
    expect(provider).not.toHaveBeenCalled();
  });

  it('the registered provider is used when the config has none', async () => {
    setUserTokenProvider(provider);
    expect(await mountTokenHeaders({ apiKey, scope: 'biometric-authentication' }, 'cus_123')).toEqual({
      [USER_TOKEN_HEADER]: tokenOf('A'),
    });
  });

  it('a token for someone else sends nothing', async () => {
    const other = jest.fn(async () => mint('A', 'cus_999'));
    const start = jest.fn();
    await expect(
      startWithMountToken({ apiKey, scope: 'biometric-authentication', getUserToken: other }, 'cus_123', start),
    ).rejects.toEqual(new UserTokenError('user_token_mismatch'));
    expect(start).not.toHaveBeenCalled();
  });

  it('a workflow mount the server says needs a token: one fetch, one retry', async () => {
    const seen: Record<string, string>[] = [];
    const start = jest.fn(async (headers: Record<string, string>) => {
      seen.push(headers);
      if (!headers[USER_TOKEN_HEADER]) throw refusal('user_token_required');
      return 'ok';
    });
    expect(await startWithMountToken({ apiKey, getUserToken: provider }, 'cus_123', start)).toBe('ok');
    expect(seen).toEqual([{}, { [USER_TOKEN_HEADER]: tokenOf('A') }]);
  });

  it('a token that was sent and refused as required is not retried', async () => {
    const start = jest.fn(async () => {
      throw refusal('user_token_required');
    });
    await expect(
      startWithMountToken({ apiKey, scope: 'biometric-authentication', getUserToken: provider }, 'cus_123', start),
    ).rejects.toBeInstanceOf(VerificationApiError);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('with no provider, user_token_required goes to the host unretried', async () => {
    const start = jest.fn(async () => {
      throw refusal('user_token_required');
    });
    await expect(startWithMountToken({ apiKey }, 'cus_123', start)).rejects.toBeInstanceOf(VerificationApiError);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('never keeps a biometric token anywhere but memory', async () => {
    await mountTokenHeaders({ apiKey, scope: 'biometric-authentication', getUserToken: provider }, 'cus_123');
    expect(JSON.stringify(secure.__items)).not.toContain(tokenOf('A'));
  });
});

describe('/verify on a bound session', () => {
  it('user_token_invalid with a provider re-mounts; too_many_attempts never does', () => {
    const config = { apiKey, getUserToken: provider };
    expect(remountFixes(config, 'cus_123', refusal('user_token_invalid'))).toBe(true);
    expect(remountFixes(config, 'cus_123', refusal('too_many_attempts', 429))).toBe(false);
    expect(remountFixes(config, 'cus_123', refusal('user_token_required'))).toBe(false);
    expect(remountFixes({ apiKey }, 'cus_123', refusal('user_token_invalid'))).toBe(false);
    expect(remountFixes(config, undefined, refusal('user_token_invalid'))).toBe(false);
  });

  it('the re-mount resumes with a fresh token even though a session exists', async () => {
    const startSession = jest.fn(async (_input: unknown, _headers: Record<string, string>) => ({
      sessionId: 'ses_1',
      resumed: true,
    }));
    const setSessionId = jest.fn();
    const state = {
      sessionId: 'ses_1',
      config: { apiKey, userId: 'cus_123', scope: 'biometric-authentication', getUserToken: provider },
      api: { startSession },
      setSessionId,
    };
    const store = { getState: () => state } as unknown as Parameters<typeof remountAttemptSession>[0];
    expect(await remountAttemptSession(store)).toBe('ses_1');
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(startSession.mock.calls[0]![0]).toMatchObject({ externalUserId: 'cus_123', deviceRef: 'dev_ref_1' });
    expect(startSession.mock.calls[0]![1]).toEqual({ [USER_TOKEN_HEADER]: tokenOf('A') });
    expect(setSessionId).toHaveBeenCalledWith('ses_1', null);
  });
});
