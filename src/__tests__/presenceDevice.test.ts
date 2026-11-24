// The presence device (user token design rev 4, sections 6b and 14):
// registration after the 202, the headless refresh, the seals at post time,
// the queue's change stamps and the held watch. The native key is a software
// P-256 key behind the Nitro seam; what is checked is what gets signed and sent.

import { createVerify, generateKeyPairSync } from 'crypto';

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

jest.mock(
  'expo-secure-store',
  () => {
    const items: Record<string, string> = {};
    return {
      __items: items,
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
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

jest.mock('../presence/report-proof', () => ({
  ...jest.requireActual('../presence/report-proof'),
  reportDevice: async () => undefined,
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const secure = require('expo-secure-store') as { __items: Record<string, string> };
/* eslint-enable @typescript-eslint/no-require-imports */

import type { MyazaDeviceIntel } from '../specs/MyazaDeviceIntel.nitro';
import { setDeviceIntelNativeForTests } from '../services/device-intel/native';
import {
  forgetPresenceDevice,
  readDevice,
  refreshIfDue,
  registerPresenceDevice,
  registrationStep,
  sealBatch,
  tokenDigest,
  type DeviceRecord,
} from '../presence/device';
import { stampChanged, wireOf } from '../presence/device-rules';
import { runFlush } from '../presence/flush';
import { readStoredUserToken } from '../presence/secure-token';
import { resetUserTokens, USER_TOKEN_HEADER, type UserTokenResponse } from '../presence/user-token';
import { heldDeadlineDay, type PresenceWatchStatus } from '../presence/watch-status';
import { removableAfterSend } from '../presence/device-rules';

const USER = 'cus_123';
const HMAC = 'hmac-token-1';
const a = `ut_test_${'A'.repeat(43)}`;
const b = `ut_test_${'B'.repeat(43)}`;
const KEY = 'toden.presence.device';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const verifies = (text: string, signature: string) =>
  createVerify('SHA256').update(text).verify(publicKey, Buffer.from(signature, 'base64'));

function fakeNative() {
  const keys = new Set<string>();
  const signed: string[] = [];
  const native = {
    presenceKeyCreate: jest.fn((alias: string) => {
      keys.add(alias);
      return spki;
    }),
    presenceKeySign: jest.fn((alias: string, text: string) => {
      if (!keys.has(alias)) return '';
      signed.push(text);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('crypto').createSign('SHA256').update(text).sign(privateKey).toString('base64');
    }),
    presenceKeyDelete: jest.fn((alias: string) => {
      keys.delete(alias);
    }),
    presenceKeyStorage: jest.fn((alias: string) => (keys.has(alias) ? 'strongbox' : '')),
  };
  return { native, keys, signed };
}

function mint(token: string): UserTokenResponse {
  return { token, externalUserId: USER, purpose: 'presence', expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
}

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function answers(...replies: Array<{ status: number; body?: unknown; date?: string }>) {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const reply = replies[calls.length - 1] ?? { status: 500 };
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      headers: { get: (name: string) => (name.toLowerCase() === 'date' ? (reply.date ?? null) : null) },
      json: async () => reply.body ?? {},
    };
  }) as unknown as typeof fetch;
  return calls;
}

const stored = async (): Promise<DeviceRecord | null> => readDevice();
const save = (r: DeviceRecord) => {
  secure.__items[KEY] = JSON.stringify(r);
};

let fake = fakeNative();
beforeEach(() => {
  for (const k of Object.keys(secure.__items)) delete secure.__items[k];
  fake = fakeNative();
  setDeviceIntelNativeForTests(fake.native as unknown as MyazaDeviceIntel);
  resetUserTokens();
});
afterAll(() => setDeviceIntelNativeForTests(null));

describe('pure rules', () => {
  it('the refusal mark is a digest, never the token', () => {
    expect(tokenDigest(HMAC)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenDigest(HMAC)).not.toContain(HMAC);
  });

  it('registration steps', () => {
    const keyed: DeviceRecord = { externalUserId: USER, alias: 'k', publicKey: 'p' };
    expect(registrationStep(null, USER, HMAC)).toEqual({ kind: 'new_key', discard: null });
    const registered = { ...keyed, deviceId: 'upd_1', registeredFor: tokenDigest(HMAC) };
    expect(registrationStep(registered, USER, HMAC)).toEqual({ kind: 'registered' });
    // A device serves only the verification whose token registered it: a new
    // verification's token needs a new key and a new registration.
    expect(registrationStep(registered, USER, 'hmac-token-2')).toEqual({ kind: 'new_key', discard: 'k' });
    expect(registrationStep({ ...keyed, deviceId: 'upd_1' }, USER, HMAC)).toEqual({ kind: 'new_key', discard: 'k' });
    expect(registrationStep(keyed, USER, HMAC)).toEqual({ kind: 'reuse', record: keyed });
    expect(registrationStep(keyed, 'cus_other', HMAC)).toEqual({ kind: 'new_key', discard: 'k' });
    const refused = { externalUserId: USER, refusedFor: tokenDigest(HMAC) };
    expect(registrationStep(refused, USER, HMAC)).toEqual({ kind: 'refused' });
    expect(registrationStep(refused, USER, 'hmac-token-2')).toEqual({ kind: 'new_key', discard: null });
  });

  it('a seal covers the row as posted, emulator flag included; a row with no stamp goes unsealed', () => {
    const wire = [
      { day: '2026-11-20', source: 'geofence' as const, dwellMinutes: 610, nightPresent: true, samples: 14, integrity: { emulator: true } },
      { day: '2026-11-21', source: 'geofence' as const, dwellMinutes: 610, nightPresent: true, samples: 14 },
    ];
    const sealed = sealBatch(wire, [1795000000000, undefined], 'upd_1', USER, (text) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('crypto').createSign('SHA256').update(text).sign(privateKey).toString('base64'),
    );
    expect(sealed?.sealDeviceId).toBe('upd_1');
    const seal = (sealed?.observations[0] as { seal: { observedAt: string; signature: string } }).seal;
    expect(seal.observedAt).toBe('2026-11-18T11:06:40.000Z');
    expect(verifies('toden-presence-seal-v1\nupd_1\ncus_123\n2026-11-20|geofence|610|1|14|0|1\n1795000000000', seal.signature)).toBe(true);
    expect(sealed?.observations[1]).toEqual(wire[1]);
    expect(sealBatch(wire, [1, 2], 'upd_1', USER, () => null)).toBeNull();
  });

  it('a new or changed day is stamped; an unchanged one keeps its stamp; the wire never sees it', () => {
    const before = [
      { day: '2026-11-19', source: 'geofence' as const, dwellMinutes: 60, nightPresent: false, samples: 1, observedAtMillis: 5 },
      { day: '2026-11-20', source: 'geofence' as const, dwellMinutes: 60, nightPresent: false, samples: 1, observedAtMillis: 5 },
    ];
    const merged = [before[0]!, { ...before[1]!, dwellMinutes: 120, samples: 2 }, { ...before[0]!, day: '2026-11-21', observedAtMillis: undefined }];
    const out = stampChanged(before, merged, 99);
    expect(out.map((o) => o.observedAtMillis)).toEqual([5, 99, 99]);
    expect(wireOf(out[1]!)).not.toHaveProperty('observedAtMillis');
  });

  it('the flush says what was sent and what was dropped; a held watch keeps later days', async () => {
    const days = Array.from({ length: 40 }, (_, i) => ({ day: `2026-${i < 31 ? '10' : '11'}-${String((i % 31) + 1).padStart(2, '0')}` }));
    const statuses = [200, 400];
    const run = await runFlush(days, async () => statuses.shift() ?? null);
    expect(run.sent).toHaveLength(31);
    expect(run.dropped).toHaveLength(9);
    expect(run.remaining).toEqual([]);
    expect(removableAfterSend(run.sent, '2026-10-10')).toHaveLength(10);
  });

  it('the held deadline: in progress past it only', () => {
    const status = (state: PresenceWatchStatus['state']) => ({ state, deadlineAt: '2026-11-20T18:00:00.000Z' }) as PresenceWatchStatus;
    expect(heldDeadlineDay(status('in_progress'), Date.parse('2026-11-21T00:00:00Z'))).toBe('2026-11-20');
    expect(heldDeadlineDay(status('in_progress'), Date.parse('2026-11-19T00:00:00Z'))).toBeNull();
    expect(heldDeadlineDay(status('inconclusive'), Date.parse('2026-11-21T00:00:00Z'))).toBeNull();
  });
});

describe('registration', () => {
  const input = (getUserToken?: () => Promise<UserTokenResponse | null>) => ({
    apiKey: 'pk_test_abc',
    externalUserId: USER,
    presenceToken: HMAC,
    ...(getUserToken ? { getUserToken } : {}),
  });

  it('no provider: no key, no request, as 4.4.0', async () => {
    const calls = answers();
    expect(await registerPresenceDevice(input())).toBe('no_provider');
    expect(calls).toHaveLength(0);
    expect(fake.native.presenceKeyCreate).not.toHaveBeenCalled();
  });

  it('registers with the HMAC token, a fresh presence user token and a proof over the registration text', async () => {
    const calls = answers({ status: 201, body: { object: 'presence_device', id: 'upd_1', state: 'pending' } });
    const provider = jest.fn(async () => mint(a));
    expect(await registerPresenceDevice(input(provider))).toBe('registered');
    const call = calls[0]!;
    expect(call.url).toMatch(/\/api\/v1\/address\/presence\/devices$/);
    expect(call.headers[USER_TOKEN_HEADER]).toBe(a);
    expect(call.body).toMatchObject({ externalUserId: USER, publicKey: spki, keyStorage: 'strongbox', presenceToken: HMAC });
    const text = `toden-presence-device-v1\n${USER}\n${spki}\n${call.body['signedAt']}`;
    expect(verifies(text, call.body['proof'] as string)).toBe(true);
    expect((await stored())?.deviceId).toBe('upd_1');
    expect((await stored())?.registeredFor).toBe(tokenDigest(HMAC));
  });

  it('a new verification registers a new key; the old one is deleted', async () => {
    fake.keys.add('old');
    save({ externalUserId: USER, alias: 'old', publicKey: spki, deviceId: 'upd_1', registeredFor: tokenDigest('hmac-token-0') });
    const calls = answers({ status: 201, body: { id: 'upd_2', state: 'pending' } });
    expect(await registerPresenceDevice(input(async () => mint(a)))).toBe('registered');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body['presenceToken']).toBe(HMAC);
    expect(fake.keys.has('old')).toBe(false);
    expect(fake.native.presenceKeyCreate).toHaveBeenCalledTimes(1);
    expect((await stored())?.deviceId).toBe('upd_2');
  });

  it('a registered phone answers at once, and the host mints nothing', async () => {
    save({ externalUserId: USER, alias: 'k', publicKey: spki, deviceId: 'upd_1', registeredFor: tokenDigest(HMAC) });
    const calls = answers();
    const provider = jest.fn(async () => mint(a));
    expect(await registerPresenceDevice(input(provider))).toBe('registered');
    expect(provider).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('refused: the key goes, and no new attempt until a new verification', async () => {
    answers({ status: 403, body: { error: { code: 'device_registration_refused' } } });
    expect(await registerPresenceDevice(input(async () => mint(a)))).toBe('refused');
    expect(fake.keys.size).toBe(0);
    expect((await stored())?.refusedFor).toBe(tokenDigest(HMAC));
    const calls = answers();
    expect(await registerPresenceDevice(input(async () => mint(b)))).toBe('refused');
    expect(calls).toHaveLength(0);
  });

  it('user_token_invalid: one fresh token, the same key, never a third try', async () => {
    const calls = answers(
      { status: 403, body: { error: { code: 'user_token_invalid' } } },
      { status: 403, body: { error: { code: 'user_token_invalid' } } },
    );
    const provider = jest.fn().mockResolvedValueOnce(mint(a)).mockResolvedValueOnce(mint(b));
    expect(await registerPresenceDevice(input(provider))).toBe('user_token_invalid');
    expect(calls.map((c) => c.headers[USER_TOKEN_HEADER])).toEqual([a, b]);
    expect(calls[0]!.body['publicKey']).toBe(calls[1]!.body['publicKey']);
    expect(fake.native.presenceKeyCreate).toHaveBeenCalledTimes(1);
  });

  it('an answer that never comes keeps the key for the next try (one key, one registration)', async () => {
    answers({ status: 503 });
    expect(await registerPresenceDevice(input(async () => mint(a)))).toBe('keep');
    const kept = await stored();
    expect(kept?.alias).toBeTruthy();
    answers({ status: 200, body: { id: 'upd_2' } });
    expect(await registerPresenceDevice(input(async () => mint(b)))).toBe('registered');
    expect(fake.native.presenceKeyCreate).toHaveBeenCalledTimes(1);
  });

  it('no hardware key: nothing is sent, and the host mints nothing', async () => {
    fake.native.presenceKeyCreate.mockReturnValueOnce('');
    const calls = answers();
    const provider = jest.fn(async () => mint(a));
    expect(await registerPresenceDevice(input(provider))).toBe('no_key');
    expect(calls).toHaveLength(0);
    expect(provider).not.toHaveBeenCalled();
  });

  it('the 202 and a later enable asking at once make one key and one mint', async () => {
    const calls = answers({ status: 201, body: { id: 'upd_1' } });
    const provider = jest.fn(async () => mint(a));
    const [first, second] = await Promise.all([
      registerPresenceDevice(input(provider)),
      registerPresenceDevice(input(provider)),
    ]);
    expect([first, second]).toEqual(['registered', 'registered']);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(fake.native.presenceKeyCreate).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });

  it('the device limit backs off, then a later foreground tries again', async () => {
    answers({ status: 409, body: { error: { code: 'presence_device_limit' } } });
    let clock = Date.now();
    const timed = { ...input(async () => mint(a)), now: () => clock };
    expect(await registerPresenceDevice(timed)).toBe('limit');
    expect(fake.keys.size).toBe(0);
    expect((await stored())?.refusedFor).toBeUndefined();
    const none = answers();
    expect(await registerPresenceDevice(timed)).toBe('limit');
    expect(none).toHaveLength(0);
    clock += 7 * 3_600_000;
    answers({ status: 201, body: { id: 'upd_9' } });
    expect(await registerPresenceDevice(timed)).toBe('registered');
  });

  it('logout forgets the device and deletes its key', async () => {
    fake.keys.add('k');
    save({ externalUserId: USER, alias: 'k', publicKey: spki, deviceId: 'upd_1' });
    await forgetPresenceDevice('cus_other');
    expect(await stored()).not.toBeNull();
    await forgetPresenceDevice(USER);
    expect(await stored()).toBeNull();
    expect(fake.keys.has('k')).toBe(false);
  });
});

describe('refresh', () => {
  const cfg = { apiKey: 'pk_test_abc' };
  const registered = () => {
    fake.keys.add('k');
    save({ externalUserId: USER, alias: 'k', publicKey: spki, deviceId: 'upd_1', lastSignedAt: 10 });
  };

  it('201: a signed refresh, the token checked and kept for the flush', async () => {
    registered();
    const calls = answers({ status: 201, body: mint(a), date: new Date().toUTCString() });
    expect(await refreshIfDue(USER, cfg)).toBe(true);
    const body = calls[0]!.body;
    expect(calls[0]!.url).toMatch(/\/api\/v1\/address\/presence\/devices\/token$/);
    expect(calls[0]!.headers[USER_TOKEN_HEADER]).toBeUndefined();
    expect(verifies(`toden-presence-refresh-v1\nupd_1\n${USER}\n${body['signedAt']}`, body['signature'] as string)).toBe(true);
    const kept = await readStoredUserToken();
    expect(kept !== 'locked' && kept?.token).toBe(a);
    // Not again within 30 minutes.
    expect(await refreshIfDue(USER, cfg)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('a token for someone else is never kept', async () => {
    registered();
    answers({ status: 201, body: { ...mint(a), externalUserId: 'cus_other' } });
    expect(await refreshIfDue(USER, cfg)).toBe(false);
    expect(await readStoredUserToken()).toBeNull();
  });

  it('403 presence_device_invalid is the only answer that deletes the key', async () => {
    registered();
    answers({ status: 403, body: { error: { code: 'presence_device_invalid' } } });
    expect(await refreshIfDue(USER, cfg)).toBe(false);
    expect(await stored()).toBeNull();
    expect(fake.keys.has('k')).toBe(false);
  });

  it('clock_skew: corrected from the Date header, one retry, the key kept', async () => {
    registered();
    const server = new Date(Date.now() + 10 * 60_000);
    const calls = answers(
      { status: 400, body: { error: { code: 'clock_skew' } }, date: server.toUTCString() },
      { status: 409, body: { error: { code: 'stale_signed_at' } } },
    );
    expect(await refreshIfDue(USER, cfg)).toBe(false);
    expect(calls).toHaveLength(2);
    const first = calls[0]!.body['signedAt'] as number;
    const second = calls[1]!.body['signedAt'] as number;
    expect(second).toBeGreaterThan(first + 9 * 60_000);
    expect(fake.keys.has('k')).toBe(true);
    expect((await stored())?.deviceId).toBe('upd_1');
  });

  it('a signedAt once sent is never sent again', async () => {
    fake.keys.add('k');
    save({ externalUserId: USER, alias: 'k', publicKey: spki, deviceId: 'upd_1', lastSignedAt: Date.now() + 3_600_000 });
    const calls = answers({ status: 429, body: { error: { code: 'presence_refresh_limited' } } });
    await refreshIfDue(USER, cfg);
    expect(calls[0]!.body['signedAt']).toBe((JSON.parse(secure.__items[KEY]!) as DeviceRecord).lastSignedAt);
    expect(calls[0]!.body['signedAt'] as number).toBeGreaterThan(Date.now());
  });

  it('409 no_live_watch backs off six hours', async () => {
    registered();
    answers({ status: 409, body: { error: { code: 'no_live_watch' } } });
    expect(await refreshIfDue(USER, cfg)).toBe(false);
    const record = await stored();
    expect(record?.backOffUntil).toBeGreaterThan(Date.now() + 5 * 3_600_000);
    expect(fake.keys.has('k')).toBe(true);
  });

  it('logout while a refresh is out: the device does not come back and no token is kept', async () => {
    registered();
    let reply: (value: unknown) => void = () => undefined;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    ) as unknown as typeof fetch;
    const running = refreshIfDue(USER, cfg);
    await new Promise((r) => setTimeout(r, 10));
    await forgetPresenceDevice(USER);
    const body = mint(a);
    reply({ status: 201, headers: { get: () => null }, json: async () => body });
    expect(await running).toBe(false);
    expect(await stored()).toBeNull();
    expect(await readStoredUserToken()).toBeNull();
  });

  it('two flushes asking at once send one refresh', async () => {
    registered();
    const calls = answers({ status: 201, body: mint(a) }, { status: 201, body: mint(b) });
    const [first, second] = await Promise.all([refreshIfDue(USER, cfg), refreshIfDue(USER, cfg)]);
    expect([first, second]).toEqual([true, true]);
    expect(calls).toHaveLength(1);
  });

  it('no registered device: no request', async () => {
    const calls = answers();
    expect(await refreshIfDue(USER, cfg)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('the flush', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const bg = require('../presence/background-store') as typeof import('../presence/background-store');
  const { flushPendingObservations } = require('../presence/flush') as typeof import('../presence/flush');
  const { keepPresenceUserToken } = require('../presence/secure-token') as typeof import('../presence/secure-token');
  const { mergeObservations } = require('../presence/sampler') as typeof import('../presence/sampler');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const day = (d: string) => ({ day: d, source: 'geofence' as const, dwellMinutes: 60, nightPresent: true, samples: 1 });

  beforeEach(() => {
    bg.replacePending(USER, []);
    bg.saveReporterConfig(USER, { apiKey: 'pk_test_abc' });
    bg.saveHeldDeadline(USER, null);
    // Earlier cases kept a token, which marks tokens in use for this user.
    bg.saveUserTokensInUse(USER, false);
  });

  it('with no user token the body is 4.4.0s: no seals, no local fields', async () => {
    fake.keys.add('k');
    save({ externalUserId: USER, alias: 'k', publicKey: spki, deviceId: 'upd_1' });
    bg.queueObservations(USER, [day('2026-11-20')], mergeObservations);
    const calls = answers({ status: 201 });
    await flushPendingObservations(USER);
    const body = calls[0]!.body as { observations: Array<Record<string, unknown>> };
    expect(body).not.toHaveProperty('sealDeviceId');
    expect(Object.keys(body.observations[0]!).sort()).toEqual(['day', 'dwellMinutes', 'nightPresent', 'samples', 'source']);
    expect(bg.pendingObservations(USER)).toEqual([]);
  });

  it('beside a user token, each stamped day is sealed over its posted row', async () => {
    fake.keys.add('k');
    save({ externalUserId: USER, alias: 'k', publicKey: spki, deviceId: 'upd_1' });
    await keepPresenceUserToken({ token: a, externalUserId: USER, purpose: 'presence', expiresAtMs: Date.now() + 3_600_000 });
    bg.queueObservations(USER, [day('2026-11-20')], mergeObservations);
    const calls = answers({ status: 201 });
    await flushPendingObservations(USER);
    const body = calls[0]!.body as { sealDeviceId: string; observations: Array<Record<string, unknown>> };
    expect(calls[0]!.headers[USER_TOKEN_HEADER]).toBe(a);
    expect(body.sealDeviceId).toBe('upd_1');
    const posted = body.observations[0]!;
    const seal = posted['seal'] as { observedAt: string; signature: string };
    const at = Date.parse(seal.observedAt);
    expect(verifies(`toden-presence-seal-v1\nupd_1\n${USER}\n2026-11-20|geofence|60|1|1|0|0\n${at}`, seal.signature)).toBe(true);
    expect(posted).not.toHaveProperty('observedAtMillis');
  });

  it('a held watch keeps the days after its deadline queued after a 2xx', async () => {
    bg.queueObservations(USER, [day('2026-11-19'), day('2026-11-20'), day('2026-11-21')], mergeObservations);
    bg.saveHeldDeadline(USER, '2026-11-20');
    answers({ status: 201 });
    await flushPendingObservations(USER);
    expect(bg.pendingObservations(USER).map((o) => o.day)).toEqual(['2026-11-21']);
  });

  it('a refusal keeps the whole queue', async () => {
    bg.queueObservations(USER, [day('2026-11-19')], mergeObservations);
    answers({ status: 503 });
    await flushPendingObservations(USER);
    expect(bg.pendingObservations(USER)).toHaveLength(1);
  });
});
