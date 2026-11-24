// The HMAC presenceToken in device-only storage (user token design rev 4, R65).
// With expo-secure-store, the 202's token never lands in
// myaza-kyc-presence.json (the documents directory, which backups copy), and a
// token an older build left there is moved once, then deleted from the file.

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
    const options: unknown[] = [];
    return {
      __items: items,
      __options: options,
      __locked: { value: false },
      __failWrites: { value: false },
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
      getItemAsync: jest.fn(async (key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        if (require('expo-secure-store').__locked.value) throw new Error('User interaction is not allowed.');
        return items[key] ?? null;
      }),
      setItemAsync: jest.fn(async (key: string, value: string, opts: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        if (require('expo-secure-store').__failWrites.value) throw new Error('write failed');
        options.push(opts);
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
const secure = require('expo-secure-store') as {
  __items: Record<string, string>;
  __options: unknown[];
  __locked: { value: boolean };
  __failWrites: { value: boolean };
};
const fsMock = require('../presence/fs') as { __files: Record<string, Record<string, Record<string, unknown>>> };
/* eslint-enable @typescript-eslint/no-require-imports */

import { postObservations } from '../presence/post';
import { clearPresencePin, presenceTokenFor, savePresencePin, savePresenceToken } from '../presence/store';

const pin = { lat: 6.4281, lng: 3.4219 };
const FILE = 'myaza-kyc-presence.json';
const fileToken = (user: string) => fsMock.__files[FILE]?.[user]?.['presenceToken'];
const settle = () => presenceTokenFor('__settle__');

beforeEach(() => {
  for (const k of Object.keys(secure.__items)) delete secure.__items[k];
  secure.__options.length = 0;
  secure.__locked.value = false;
  secure.__failWrites.value = false;
});

describe('the HMAC presenceToken with expo-secure-store', () => {
  it('is kept in device-only storage and never in the backed-up file', async () => {
    savePresencePin('u1', pin);
    await savePresenceToken('u1', 'tok_1');
    expect(fileToken('u1')).toBeUndefined();
    expect(JSON.stringify(fsMock.__files)).not.toContain('tok_1');
    expect(JSON.parse(secure.__items['toden.presence.hmacTokens']!)).toEqual({ u1: 'tok_1' });
    expect(secure.__options).toContainEqual({ keychainAccessible: 'afterFirstUnlockThisDeviceOnly' });
    expect(await presenceTokenFor('u1')).toEqual({ token: 'tok_1', locked: false });
  });

  it('moves a token an older build left in the file once, then deletes the file copy', async () => {
    savePresencePin('u2', pin);
    await settle();
    fsMock.__files[FILE]!['u2']!['presenceToken'] = 'tok_old';
    expect(await presenceTokenFor('u2')).toEqual({ token: 'tok_old', locked: false });
    expect(fileToken('u2')).toBeUndefined();
    expect(JSON.parse(secure.__items['toden.presence.hmacTokens']!)).toEqual({ u2: 'tok_old' });
    expect((await presenceTokenFor('u2')).token).toBe('tok_old');
  });

  it('leaves the file copy when the move cannot be confirmed', async () => {
    savePresencePin('u3', pin);
    await settle();
    fsMock.__files[FILE]!['u3']!['presenceToken'] = 'tok_old';
    secure.__failWrites.value = true;
    expect((await presenceTokenFor('u3')).token).toBe('tok_old');
    expect(fileToken('u3')).toBe('tok_old');
  });

  it('before the first unlock: no token to send, and the post is held', async () => {
    savePresencePin('u4', pin);
    await savePresenceToken('u4', 'tok_4');
    secure.__locked.value = true;
    expect(await presenceTokenFor('u4')).toEqual({ token: undefined, locked: true });
    const realFetch = globalThis.fetch;
    const fetchMock = jest.fn(async () => ({ ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const sent = await postObservations('pk_test_1', 'http://localhost:3001', 'u4', [
        { day: '2026-11-01', source: 'geofence', dwellMinutes: 40, nightPresent: true, samples: 1 },
      ]);
      expect(sent).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('a new pin and a cleared pin forget the secure copy', async () => {
    savePresencePin('u5', pin);
    await savePresenceToken('u5', 'tok_5');
    savePresencePin('u5', pin);
    expect((await presenceTokenFor('u5')).token).toBeUndefined();
    await savePresenceToken('u5', 'tok_6');
    clearPresencePin('u5');
    expect((await presenceTokenFor('u5')).token).toBeUndefined();
    expect(secure.__items['toden.presence.hmacTokens']).toBeUndefined();
  });

  it('the post still carries the token, read from device-only storage', async () => {
    savePresencePin('u6', pin);
    await savePresenceToken('u6', 'tok_6');
    const realFetch = globalThis.fetch;
    const fetchMock = jest.fn(async () => ({ ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await postObservations('pk_test_1', 'http://localhost:3001', 'u6', [
        { day: '2026-11-01', source: 'geofence', dwellMinutes: 40, nightPresent: true, samples: 1 },
      ]);
      const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
      expect(body.presenceToken).toBe('tok_6');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
