// User tokens on the presence calls, end to end through the stores: the
// header only when a checked token exists, 4.4.0's wire without one, the
// background queue kept on any refusal and flushed oldest first in 31-day
// chunks, and the token kept only in secure storage.

jest.mock('../presence/fs', () => {
  const files: Record<string, Record<string, unknown>> = {};
  return {
    __files: files,
    readJsonFile: (name: string) => JSON.parse(JSON.stringify(files[name] ?? {})),
    writeJsonFile: (name: string, value: Record<string, unknown>) => {
      files[name] = JSON.parse(JSON.stringify(value));
    },
  };
});

jest.mock('../presence/background', () => ({ disableBackgroundPresence: jest.fn(async () => undefined) }));
jest.mock('../presence/foreground-service', () => ({ disableForegroundService: jest.fn(async () => undefined) }));

jest.mock(
  'expo-secure-store',
  () => {
    const items: Record<string, string> = {};
    return {
      __items: items,
      __locked: { value: false },
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
      getItemAsync: jest.fn(async (key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        if (require('expo-secure-store').__locked.value) throw new Error('User interaction is not allowed.');
        return items[key] ?? null;
      }),
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

/* eslint-disable @typescript-eslint/no-require-imports */
const fsMock = require('../presence/fs') as { __files: Record<string, Record<string, unknown>> };
const secure = require('expo-secure-store') as {
  __items: Record<string, string>;
  __locked: { value: boolean };
  setItemAsync: jest.Mock;
};
/* eslint-enable @typescript-eslint/no-require-imports */

import {
  loadReporterConfig,
  pendingObservations,
  replacePending,
  saveFenceUser,
  saveReporterConfig,
  userTokensInUse,
} from '../presence/background-store';
import { flushPendingObservations } from '../presence/flush';
import { readStoredUserToken } from '../presence/secure-token';
import { setUserToken } from '../presence/set-user-token';
import { standDownPresence } from '../presence/stand-down';
import { savePresencePin } from '../presence/store';
import {
  USER_TOKEN_HEADER,
  UserTokenError,
  cachedUserToken,
  onUserTokenAccepted,
  resetUserTokens,
  setUserTokenProvider,
} from '../presence/user-token';
import { fetchPresenceWatchStatus } from '../presence/watch-status';
import { readWatch } from '../presence/watch-wait';
import { keepPresenceUserToken } from '../presence/secure-token';

const USER = 'cus_123';
const KEY = 'pk_test_abc';
const tokenOf = (c: string) => `ut_test_${c.repeat(43)}`;
const mint = (c: string, over: Record<string, unknown> = {}) => ({
  object: 'user_token',
  id: `utk_${c}`,
  token: tokenOf(c),
  purpose: 'presence',
  externalUserId: USER,
  expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  maxUses: null,
  ...over,
});
const day = (i: number) => new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10);
const queue = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ day: day(n - 1 - i), source: 'geofence' as const, dwellMinutes: 30, nightPresent: true, samples: 1 }));

const realFetch = globalThis.fetch;
let fetchMock: jest.Mock;
let answers: number[];
const headersOf = (i: number) => (fetchMock.mock.calls[i][1] as { headers: Record<string, string> }).headers;
const bodyOf = (i: number) => JSON.parse((fetchMock.mock.calls[i][1] as { body: string }).body);

beforeEach(() => {
  resetUserTokens();
  onUserTokenAccepted(keepPresenceUserToken);
  for (const k of Object.keys(fsMock.__files)) delete fsMock.__files[k];
  for (const k of Object.keys(secure.__items)) delete secure.__items[k];
  secure.__locked.value = false;
  answers = [];
  fetchMock = jest.fn(async () => {
    const status = answers.length > 0 ? answers.shift()! : 200;
    const code = status === 403 ? 'user_token_invalid' : 'invalid_api_key';
    return new Response(JSON.stringify(status === 200 ? { status: 'in_progress' } : { error: { code } }), { status });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('legacy publishable key: the wire is unchanged', () => {
  it('a status read with no provider sends exactly the 4.4.0 headers', async () => {
    await fetchPresenceWatchStatus({ apiKey: KEY, externalUserId: USER, devUrl: 'http://localhost:3001' });
    expect(headersOf(0)).toEqual({ Authorization: `Bearer ${KEY}` });
  });

  it('a provider that answers null, or fails, sends no header', async () => {
    await fetchPresenceWatchStatus({ apiKey: KEY, externalUserId: USER, getUserToken: async () => null });
    await fetchPresenceWatchStatus({
      apiKey: KEY,
      externalUserId: USER,
      getUserToken: async () => {
        throw new Error('422 invalid_publishable_key');
      },
    });
    expect(headersOf(0)).toEqual({ Authorization: `Bearer ${KEY}` });
    expect(headersOf(1)).toEqual({ Authorization: `Bearer ${KEY}` });
  });

  it('the background flush with no user token in use posts once, without the header', async () => {
    saveReporterConfig(USER, { apiKey: KEY });
    replacePending(USER, queue(10));
    await flushPendingObservations(USER);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOf(0)).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` });
    expect(pendingObservations(USER)).toEqual([]);
  });
});

describe('scoped publishable key: the header only with a checked token', () => {
  it('sends the provider token, which gets no user id', async () => {
    const provider = jest.fn(async () => mint('A'));
    await fetchPresenceWatchStatus({ apiKey: KEY, externalUserId: USER, getUserToken: provider });
    expect(provider).toHaveBeenCalledWith({ purpose: 'presence' });
    expect(headersOf(0)[USER_TOKEN_HEADER]).toBe(tokenOf('A'));
  });

  it('a token for another user sends nothing and says why', async () => {
    const read = await readWatch(KEY, undefined, USER, async () => mint('A', { externalUserId: 'cus_999' }));
    expect(read.refusal).toBe('user_token_mismatch');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a refused token is fetched again once and the read retried once', async () => {
    answers = [403, 200];
    const provider = jest.fn().mockResolvedValueOnce(mint('A')).mockResolvedValueOnce(mint('B'));
    const status = await fetchPresenceWatchStatus({ apiKey: KEY, externalUserId: USER, getUserToken: provider });
    expect(status?.state).toBe('in_progress');
    expect(headersOf(1)[USER_TOKEN_HEADER]).toBe(tokenOf('B'));
  });

  it('a 401 is an API-key problem: no new token, no retry', async () => {
    answers = [401];
    const provider = jest.fn(async () => mint('A'));
    expect(await fetchPresenceWatchStatus({ apiKey: KEY, externalUserId: USER, getUserToken: provider })).toBeNull();
    expect(provider).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the presence token only in secure storage, device only', async () => {
    saveReporterConfig(USER, { apiKey: KEY });
    setUserTokenProvider(async () => mint('A'));
    await fetchPresenceWatchStatus({ apiKey: KEY, externalUserId: USER });
    expect(secure.setItemAsync).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      keychainAccessible: 'afterFirstUnlockThisDeviceOnly',
    });
    expect(JSON.stringify(fsMock.__files)).not.toContain('ut_');
    expect(userTokensInUse(USER)).toBe(true);
  });
});

describe('background queue with user tokens in use', () => {
  beforeEach(async () => {
    saveReporterConfig(USER, { apiKey: KEY });
    saveFenceUser(USER);
    await setUserToken(mint('A'));
    fetchMock.mockClear();
  });

  it('posts 40 days in two chunks, oldest first, with the header', async () => {
    replacePending(USER, queue(40));
    await flushPendingObservations(USER);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = bodyOf(0).observations.map((o: { day: string }) => o.day);
    expect(first).toHaveLength(31);
    expect(first[0]).toBe(day(0));
    expect(bodyOf(1).observations).toHaveLength(9);
    expect(headersOf(1)[USER_TOKEN_HEADER]).toBe(tokenOf('A'));
    expect(pendingObservations(USER)).toEqual([]);
  });

  it('keeps the queue on a refusal and waits for a new token', async () => {
    replacePending(USER, queue(10));
    answers = [403];
    await flushPendingObservations(USER);
    expect(pendingObservations(USER)).toHaveLength(10);
    const stored = await readStoredUserToken();
    expect(stored !== 'locked' && stored?.stale).toBe(true);
    fetchMock.mockClear();
    await flushPendingObservations(USER);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a new token from a silent push flushes what was held', async () => {
    replacePending(USER, queue(10));
    answers = [403];
    await flushPendingObservations(USER);
    await setUserToken(mint('B'));
    expect(headersOf(1)[USER_TOKEN_HEADER]).toBe(tokenOf('B'));
    expect(pendingObservations(USER)).toEqual([]);
  });

  it('a refusal of an older token never marks a newer one stale', async () => {
    replacePending(USER, queue(10));
    // The flush with A is still out when a silent push hands over B.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchMock.mockImplementationOnce(async () => {
      await gate;
      return new Response(JSON.stringify({ error: { code: 'user_token_invalid' } }), { status: 403 });
    });
    const flushA = flushPendingObservations(USER);
    await new Promise((r) => setTimeout(r, 0));
    await setUserToken(mint('B'));
    release();
    await flushA;
    const stored = await readStoredUserToken();
    expect(stored !== 'locked' && stored?.token).toBe(tokenOf('B'));
    expect(stored !== 'locked' && stored?.stale).toBe(false);
    expect(cachedUserToken(USER, 'presence')?.token).toBe(tokenOf('B'));
  });

  it('a locked Keychain holds the queue', async () => {
    replacePending(USER, queue(10));
    secure.__locked.value = true;
    await flushPendingObservations(USER);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pendingObservations(USER)).toHaveLength(10);
  });

  it('setUserToken refuses a token for another user', async () => {
    await expect(setUserToken(mint('C', { externalUserId: 'cus_999' }))).rejects.toEqual(
      expect.objectContaining({ code: 'user_token_mismatch' }),
    );
    await expect(setUserToken(mint('C', { externalUserId: 'cus_999' }))).rejects.toBeInstanceOf(UserTokenError);
  });

  it('stand-down forgets the token', async () => {
    savePresencePin(USER, { lat: 6.4, lng: 3.4 });
    await standDownPresence(USER);
    expect(await readStoredUserToken()).toBeNull();
    expect(userTokensInUse(USER)).toBe(false);
    expect(loadReporterConfig(USER)).not.toBeNull();
  });
});
