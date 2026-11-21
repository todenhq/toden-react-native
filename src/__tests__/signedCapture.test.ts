import { createHash } from 'crypto';
import {
  captureDigestText,
  captureMediaOf,
  fileSha256,
  makeCaptureProof,
  type CaptureProof,
} from '../liveness/signedCapture';
import { boundChallenge } from '../presence/report-proof';
import { setDeviceIntelNativeForTests } from '../services/device-intel/native';
import type { MyazaDeviceIntel } from '../specs/MyazaDeviceIntel.nitro';
import { buildVerifyRequest, submittedIntegrity } from '../store/submit';
import { buildApplicantVerifyRequest } from '../store/submitApplicant';
import { createVerificationStore } from '../store/verificationStore';
import type { ResolvedVerificationConfig } from '../types/config';
import type { CaptureIntegrity } from '../liveness/integritySignals';

const SELFIE = 'a'.repeat(64);
const VIDEO = 'b'.repeat(64);
const DEPTH = 'c'.repeat(64);
const sha256Hex = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

// The vector kyc-core's signed-capture.test.ts pins: the two sides must agree
// byte for byte, or the platform's proof never verifies.
describe('captureDigestText', () => {
  it('hashes to the shared vector', () => {
    expect(sha256Hex(captureDigestText({ selfie: SELFIE, livenessVideo: VIDEO }))).toBe(
      '1086b34afa90de77c7232329b065da5637e479c962c569b7c7267a0b45659a77',
    );
  });

  it('hashes the shared vector with the depth frame', () => {
    expect(sha256Hex(captureDigestText({ selfie: SELFIE, livenessVideo: VIDEO, livenessDepth: DEPTH }))).toBe(
      'ec1416d3c16ad8708f250fb05d8a50bc5939490eff37a008f9381cc2dc0ab681',
    );
  });

  it('adds the depth line only when a depth frame was sent', () => {
    expect(captureDigestText({ selfie: SELFIE, livenessVideo: VIDEO, livenessDepth: DEPTH })).toBe(
      `toden-capture-v1\nselfie:${SELFIE}\nlivenessVideo:${VIDEO}\nlivenessDepth:${DEPTH}`,
    );
    expect(captureDigestText({ selfie: SELFIE, livenessVideo: VIDEO })).toBe(
      `toden-capture-v1\nselfie:${SELFIE}\nlivenessVideo:${VIDEO}`,
    );
  });

  it('leaves the line of a file not sent empty', () => {
    expect(captureDigestText({ selfie: SELFIE })).toBe(`toden-capture-v1\nselfie:${SELFIE}\nlivenessVideo:`);
  });
});

describe('captureMediaOf', () => {
  it('reads each hash by the media id the request names', () => {
    expect(
      captureMediaOf({ selfie: 'm1', livenessVideo: 'm2' }, { m1: SELFIE, m2: VIDEO, old: 'c'.repeat(64) }),
    ).toEqual({ selfie: SELFIE, livenessVideo: VIDEO });
  });

  it('reads the depth frame by its media id too', () => {
    expect(
      captureMediaOf({ selfie: 'm1', livenessVideo: 'm2', livenessDepth: 'm3' }, { m1: SELFIE, m2: VIDEO, m3: DEPTH }),
    ).toEqual({ selfie: SELFIE, livenessVideo: VIDEO, livenessDepth: DEPTH });
  });

  it('signs the selfie alone when the video never uploaded', () => {
    expect(captureMediaOf({ selfie: 'm1' }, { m1: SELFIE })).toEqual({ selfie: SELFIE });
  });

  it('never lends a retaken selfie the old file hash', () => {
    expect(captureMediaOf({ selfie: 'new' }, { old: SELFIE })).toBeNull();
  });
});

describe('fileSha256', () => {
  it('hashes the bytes the reader gives, in lowercase hex', async () => {
    const bytes = new TextEncoder().encode('the uploaded file');
    const out = await fileSha256('file:///selfie.jpg', () => ({
      read: async () => bytes as Uint8Array<ArrayBuffer>,
      digest: async (b) => new Uint8Array(createHash('sha256').update(b).digest()),
    }));
    expect(out).toBe(sha256Hex(bytes));
  });

  it('answers undefined, never throws, when the file cannot be read', async () => {
    const out = await fileSha256('file:///gone.mp4', () => ({
      read: async () => {
        throw new Error('missing');
      },
      digest: async (b) => b,
    }));
    expect(out).toBeUndefined();
  });
});

describe('makeCaptureProof', () => {
  afterEach(() => setDeviceIntelNativeForTests(null));
  const challenge = Buffer.from('issued').toString('base64');
  const api = { deviceChallenge: async () => ({ challengeId: 'c1', challenge, expiresAt: '' }) };

  it('asks the platform to sign the challenge bound to the digest', async () => {
    const signed: string[] = [];
    setDeviceIntelNativeForTests({
      playIntegrityToken: async (_p: string, c: string) => {
        signed.push(c);
        return 'token';
      },
    } as unknown as MyazaDeviceIntel);
    const media = { selfie: SELFIE, livenessVideo: VIDEO };
    const proof = await makeCaptureProof({ media, api, platform: 'android', playIntegrityCloudProjectNumber: '42' });
    // What Core recomputes: SHA-256(challenge || SHA-256(digest text)).
    const server = createHash('sha256')
      .update('issued')
      .update(createHash('sha256').update(captureDigestText(media)).digest())
      .digest('base64');
    expect(signed).toEqual([server]);
    expect(signed[0]).toBe(boundChallenge(challenge, captureDigestText(media)));
    expect(proof).toEqual({
      media,
      attestation: { platform: 'android', kind: 'play_integrity', challengeId: 'c1', token: 'token' },
    });
  });

  it('sends no proof where the platform cannot attest', async () => {
    expect(await makeCaptureProof({ media: { selfie: SELFIE }, api, platform: 'web' })).toBeUndefined();
    // No Play Integrity project: Google could not decode a token.
    expect(await makeCaptureProof({ media: { selfie: SELFIE }, api, platform: 'android' })).toBeUndefined();
  });

  it('sends no proof, and never throws, when the challenge fails', async () => {
    setDeviceIntelNativeForTests({
      appAttestSupported: () => true,
      appAttestKeyId: () => 'key',
    } as unknown as MyazaDeviceIntel);
    const failing = {
      deviceChallenge: async () => {
        throw new Error('503');
      },
    };
    expect(await makeCaptureProof({ media: { selfie: SELFIE }, api: failing, platform: 'ios' })).toBeUndefined();
  });

  it('gives up within its bound', async () => {
    setDeviceIntelNativeForTests({
      playIntegrityToken: () => new Promise<string>(() => {}),
    } as unknown as MyazaDeviceIntel);
    const proof = await makeCaptureProof({
      media: { selfie: SELFIE },
      api,
      platform: 'android',
      playIntegrityCloudProjectNumber: '42',
      timeoutMs: 20,
    });
    expect(proof).toBeUndefined();
  });
});

describe('submittedIntegrity', () => {
  const claim = { liveness: { mode: 'gestures' } } as unknown as CaptureIntegrity;
  const proof: CaptureProof = {
    media: { selfie: SELFIE },
    attestation: { platform: 'android', kind: 'play_integrity', challengeId: 'c1', token: 't' },
  };

  it('puts the proof beside the liveness claim', () => {
    expect(submittedIntegrity(claim, proof)).toEqual({ ...claim, captureProof: proof });
  });

  it('leaves the claim as it was without a proof', () => {
    expect(submittedIntegrity(claim, undefined)).toEqual(claim);
    expect(submittedIntegrity(null, undefined)).toBeUndefined();
  });
});

describe('the submission', () => {
  const claim = { liveness: { mode: 'gestures' } } as unknown as CaptureIntegrity;
  const proof: CaptureProof = {
    media: { selfie: SELFIE },
    attestation: { platform: 'ios', kind: 'app_attest', challengeId: 'c1', keyId: 'k', assertion: 'a' },
  };
  const deviceOf = (req: { metadata?: Record<string, unknown> }) =>
    req.metadata?.device as { integrity?: Record<string, unknown> } | undefined;

  function makeStore(config: Record<string, unknown> = {}) {
    const store = createVerificationStore({
      apiKey: 'pk_test_x',
      country: 'NG',
      metadata: {},
      ...config,
    } as unknown as ResolvedVerificationConfig);
    store.setState({ selectedIdType: 'bvn', idNumber: '22222222222', captureIntegrity: claim, mediaIds: { selfie: 'm1' } });
    return store;
  }

  it('carries the proof beside the liveness claim', () => {
    const req = buildVerifyRequest(makeStore().getState(), undefined, proof);
    expect(deviceOf(req)?.integrity).toEqual({ ...claim, captureProof: proof });
  });

  it('keeps the proof off a business request, which carries no selfie', () => {
    const store = makeStore({ subjectType: 'business', business: {} });
    const req = buildVerifyRequest(store.getState(), undefined, proof);
    expect(deviceOf(req)?.integrity?.captureProof).toBeUndefined();
    // The applicant's own request carries the selfie, and the proof with it.
    const applicant = buildApplicantVerifyRequest(store.getState(), 'kp_1', undefined, proof);
    expect(deviceOf(applicant)?.integrity?.captureProof).toEqual(proof);
  });
});
