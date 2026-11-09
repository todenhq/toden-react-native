import { createHash } from 'crypto';
import { boundChallenge, emulatorFlag, reportDigestText } from '../presence/report-proof';
import { sha256 } from '../presence/sha256';
import { collectAttestation } from '../services/device-intel/attestation';
import { setDeviceIntelNativeForTests } from '../services/device-intel/native';
import type { MyazaDeviceIntel } from '../specs/MyazaDeviceIntel.nitro';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('sha256', () => {
  it.each([0, 1, 55, 56, 63, 64, 65, 119, 120, 1000])('matches node for %i bytes', (n) => {
    const data = Uint8Array.from({ length: n }, (_, i) => (i * 7) & 0xff);
    expect(hex(sha256(data))).toBe(createHash('sha256').update(data).digest('hex'));
  });
});

// The vector kyc-core's report-proof.test.ts pins: the two sides must agree
// byte for byte, or the platform's proof never verifies.
describe('reportDigestText', () => {
  const report = {
    externalUserId: 'user_123',
    device: { deviceId: 'install-1', stableId: 'stable-1' },
    observations: [
      { day: '2026-10-30', source: 'geofence' as const, dwellMinutes: 120, nightPresent: true, samples: 3 },
      {
        day: '2026-10-31',
        source: 'foreground' as const,
        dwellMinutes: 0,
        nightPresent: false,
        samples: 1,
        integrity: { mockLocation: true },
      },
    ],
  };

  it('hashes to the server vector', () => {
    const digest = sha256(new TextEncoder().encode(reportDigestText(report)));
    expect(hex(digest)).toBe('14e467f5a1431e451564634466e45e7c3a62693f9bd026c9c19570c03cbf8640');
  });

  it('binds the challenge the way the server does', () => {
    const challenge = Buffer.from('issued').toString('base64');
    const server = createHash('sha256')
      .update('issued')
      .update(createHash('sha256').update(reportDigestText(report)).digest())
      .digest('base64');
    expect(boundChallenge(challenge, reportDigestText(report))).toBe(server);
  });
});

describe('attesting a report', () => {
  afterEach(() => setDeviceIntelNativeForTests(null));

  it('asks Play Integrity to sign the bound challenge, not the bare one', async () => {
    const signed: string[] = [];
    setDeviceIntelNativeForTests({
      playIntegrityToken: async (_p: string, c: string) => {
        signed.push(c);
        return 'token';
      },
    } as unknown as MyazaDeviceIntel);
    const out = await collectAttestation({
      platform: 'android',
      playIntegrityCloudProjectNumber: '42',
      api: { deviceChallenge: async () => ({ challengeId: 'c', challenge: 'YWJj', expiresAt: '' }) },
      bindChallenge: () => 'bound',
    });
    expect(signed).toEqual(['bound']);
    expect(out).toMatchObject({ kind: 'play_integrity', challengeId: 'c', token: 'token' });
  });

  it('asks App Attest to sign the bound challenge', async () => {
    const signed: string[] = [];
    setDeviceIntelNativeForTests({
      appAttestSupported: () => true,
      appAttestKeyId: () => 'key',
      appAttestAssert: async (_k: string, c: string) => {
        signed.push(c);
        return 'assertion';
      },
    } as unknown as MyazaDeviceIntel);
    await collectAttestation({
      platform: 'ios',
      api: { deviceChallenge: async () => ({ challengeId: 'c', challenge: 'YWJj', expiresAt: '' }) },
      bindChallenge: () => 'bound',
    });
    expect(signed).toEqual(['bound']);
  });
});

describe('emulatorFlag', () => {
  const o = { day: '2026-10-30', source: 'geofence' as const, dwellMinutes: 1, nightPresent: false, samples: 1 };

  it('leaves a real phone, or an unknown one, unmarked', () => {
    expect(emulatorFlag(o)).toEqual(o);
  });
});
