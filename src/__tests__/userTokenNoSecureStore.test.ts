// Without expo-secure-store (an optional module) the headless flush cannot
// read a token, so with user tokens in use it waits; a foreground caller that
// holds a checked token still sends the queue.

jest.mock('../presence/fs', () => {
  const files: Record<string, Record<string, unknown>> = {};
  return {
    readJsonFile: (name: string) => JSON.parse(JSON.stringify(files[name] ?? {})),
    writeJsonFile: (name: string, value: Record<string, unknown>) => {
      files[name] = JSON.parse(JSON.stringify(value));
    },
  };
});

import { pendingObservations, replacePending, saveFenceUser, saveReporterConfig, userTokensInUse } from '../presence/background-store';
import { flushPendingObservations } from '../presence/flush';
import { readStoredUserToken } from '../presence/secure-token';
import { setUserToken } from '../presence/set-user-token';
import { USER_TOKEN_HEADER } from '../presence/user-token';
import { fetchPresenceWatchStatus } from '../presence/watch-status';

const USER = 'cus_123';
const KEY = 'pk_test_abc';
const mint = (c: string) => ({
  token: `ut_test_${c.repeat(43)}`,
  purpose: 'presence',
  externalUserId: USER,
  expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
});
const queue = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    day: `2026-10-${String(i + 1).padStart(2, '0')}`,
    source: 'geofence' as const,
    dwellMinutes: 30,
    nightPresent: true,
    samples: 1,
  }));

const realFetch = globalThis.fetch;
let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(async () => new Response(JSON.stringify({ status: 'in_progress' }), { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  saveReporterConfig(USER, { apiKey: KEY });
  saveFenceUser(USER);
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

it('reads as unavailable, so the headless flush keeps the queue once tokens are in use', async () => {
  expect(await readStoredUserToken()).toBe('locked');
  await fetchPresenceWatchStatus({ apiKey: KEY, externalUserId: USER, getUserToken: async () => mint('A') });
  expect(userTokensInUse(USER)).toBe(true);
  replacePending(USER, queue(5));
  fetchMock.mockClear();
  await flushPendingObservations(USER);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(pendingObservations(USER)).toHaveLength(5);
});

it('a token handed over in the foreground still sends the queue', async () => {
  replacePending(USER, queue(5));
  fetchMock.mockClear();
  await setUserToken(mint('B'));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const headers = (fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers;
  expect(headers[USER_TOKEN_HEADER]).toBe(`ut_test_${'B'.repeat(43)}`);
  expect(pendingObservations(USER)).toEqual([]);
});
