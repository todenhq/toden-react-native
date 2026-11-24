// The token cache when the host's provider fails: a still-good token is kept
// rather than sending the request bare (which a scoped key refuses with
// user_token_required, never retried). A provider that answers null is the
// host saying "no token", so nothing cached is sent.

jest.mock('../presence/fs', () => ({ readJsonFile: () => ({}), writeJsonFile: () => undefined }));

import { resetUserTokens, userTokenFor } from '../presence/user-token';

const HOUR = 3600_000;
const T0 = Date.parse('2026-11-22T00:00:00Z');
const A = `ut_test_${'A'.repeat(43)}`;
const mint = (token: string) => ({
  token,
  externalUserId: 'cus_123',
  purpose: 'presence',
  expiresAt: new Date(T0 + 24 * HOUR).toISOString(),
});
const ctx = (getUserToken: jest.Mock) => ({
  apiKey: 'pk_test_abc',
  externalUserId: 'cus_123',
  purpose: 'presence' as const,
  getUserToken,
});

describe('userTokenFor when the provider fails', () => {
  beforeEach(() => resetUserTokens());

  it('past half its life, a provider that throws keeps the cached token', async () => {
    const provider = jest.fn().mockResolvedValueOnce(mint(A)).mockRejectedValueOnce(new Error('offline'));
    expect((await userTokenFor(ctx(provider), { now: () => T0 })).token).toBe(A);
    const again = await userTokenFor(ctx(provider), { now: () => T0 + 13 * HOUR });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(again).toEqual({ token: A, mismatch: false });
  });

  it('an expired cached token is never sent, even when the provider throws', async () => {
    const provider = jest.fn().mockResolvedValueOnce(mint(A)).mockRejectedValueOnce(new Error('offline'));
    await userTokenFor(ctx(provider), { now: () => T0 });
    expect((await userTokenFor(ctx(provider), { now: () => T0 + 25 * HOUR })).token).toBeNull();
  });

  it('a provider that answers null means no token, cached or not', async () => {
    const provider = jest.fn().mockResolvedValueOnce(mint(A)).mockResolvedValueOnce(null);
    await userTokenFor(ctx(provider), { now: () => T0 });
    expect((await userTokenFor(ctx(provider), { now: () => T0 + 13 * HOUR })).token).toBeNull();
  });

  it('a forced refetch after a refusal never falls back to the refused token', async () => {
    const provider = jest.fn().mockResolvedValueOnce(mint(A)).mockRejectedValueOnce(new Error('offline'));
    await userTokenFor(ctx(provider), { now: () => T0 });
    expect((await userTokenFor(ctx(provider), { force: true, now: () => T0 + HOUR })).token).toBeNull();
  });
});
