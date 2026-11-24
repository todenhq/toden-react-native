import { createPublicKey, verify } from 'crypto';

import {
  BACK_OFF_MS,
  P256_SPKI_PREFIX_HEX,
  REFRESH_INTERVAL_MS,
  clockOffsetFrom,
  nextSignedAt,
  refreshDue,
  refreshOutcome,
  refreshText,
  registrationOutcome,
  registrationText,
  removableAfterSend,
  sealText,
} from '../presence/device-rules';
import { describeInMonorepo, sharedVectors } from './helpers/monorepo';

// The shared presence device cases (sdk-flutter/test/presence_seal_vectors.json),
// replayed here as the Dart, XCTest and JVM suites replay them.

jest.mock('../presence/fs', () => ({ readJsonFile: () => ({}), writeJsonFile: () => undefined }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const v: any = sharedVectors('sdk-flutter/test/presence_seal_vectors.json', {
  registration: [],
  refresh: [],
  seal: [],
  signedAt: [],
  clockOffset: [],
  refreshAnswers: [],
  registrationAnswers: [],
  refreshDue: [],
  heldWatch: [],
});

describeInMonorepo('shared presence device vectors', () => {
  it('uses the same intervals and SPKI prefix', () => {
    expect(REFRESH_INTERVAL_MS).toBe(v.refreshIntervalMillis);
    expect(BACK_OFF_MS).toBe(v.backOffMillis);
    expect(P256_SPKI_PREFIX_HEX).toBe(v.spkiPrefixHex);
    const spki = Buffer.from(v.key.spki, 'base64');
    expect(spki.subarray(0, 26).toString('hex')).toBe(v.spkiPrefixHex);
    expect(spki.subarray(26).toString('base64')).toBe(v.key.x963);
  });

  it('a signature in the shared format verifies, and a changed text does not', () => {
    const key = createPublicKey({ key: Buffer.from(v.signature.publicKey, 'base64'), format: 'der', type: 'spki' });
    const sig = Buffer.from(v.signature.signature, 'base64');
    expect(verify('sha256', Buffer.from(v.signature.text, 'utf8'), key, sig)).toBe(true);
    expect(verify('sha256', Buffer.from(v.signature.tamperedText, 'utf8'), key, sig)).toBe(false);
  });

  it("core's own signatures verify over the texts this SDK builds", () => {
    const c = v.core;
    const key = createPublicKey({ key: Buffer.from(c.publicKey, 'base64'), format: 'der', type: 'spki' });
    const holds = (text: string, signature: string) =>
      verify('sha256', Buffer.from(text, 'utf8'), key, Buffer.from(signature, 'base64'));
    const registration = registrationText(c.registration.externalUserId, c.publicKey, c.registration.signedAt);
    expect(registration).toBe(c.registration.text);
    expect(holds(registration, c.registration.signature)).toBe(true);
    const refresh = refreshText(c.refresh.deviceId, c.refresh.externalUserId, c.refresh.signedAt);
    expect(refresh).toBe(c.refresh.text);
    expect(holds(refresh, c.refresh.signature)).toBe(true);
    const seal = sealText(c.seal.deviceId, c.seal.externalUserId, c.seal.observation, c.seal.observedAtMillis);
    expect(seal).toBe(c.seal.text);
    expect(holds(seal, c.seal.signature)).toBe(true);
  });

  for (const c of v.registration) {
    it(`registration text for ${c.externalUserId}`, () => {
      expect(registrationText(c.externalUserId, c.publicKey, c.signedAt)).toBe(c.text);
    });
  }
  for (const c of v.refresh) {
    it(`refresh text for ${c.externalUserId}`, () => {
      expect(refreshText(c.deviceId, c.externalUserId, c.signedAt)).toBe(c.text);
    });
  }
  for (const c of v.seal) {
    it(`seal: ${c.name}`, () => {
      expect(sealText(c.deviceId, c.externalUserId, c.observation, c.observedAtMillis)).toBe(c.text);
      expect(new Date(c.observedAtMillis).toISOString()).toBe(c.observedAt);
    });
  }
  for (const c of v.signedAt) {
    it(`signedAt: ${c.name}`, () => expect(nextSignedAt(c.correctedNow, c.lastSent)).toBe(c.expected));
  }
  for (const c of v.clockOffset) {
    it(`clock: ${c.name}`, () => expect(clockOffsetFrom(c.date, c.deviceNowMillis)).toBe(c.expected));
  }
  for (const c of v.refreshAnswers) {
    it(`refresh answer: ${c.name}`, () => expect(refreshOutcome(c.status, c.code)).toBe(c.outcome));
  }
  for (const c of v.registrationAnswers) {
    it(`registration answer: ${c.name}`, () => expect(registrationOutcome(c.status, c.code)).toBe(c.outcome));
  }
  for (const c of v.refreshDue) {
    it(`refresh due: ${c.name}`, () =>
      expect(refreshDue(c.nowMillis, c.lastRefreshAtMillis, c.backOffUntilMillis)).toBe(c.due));
  }
  for (const c of v.heldWatch) {
    it(`held watch: ${c.name}`, () => {
      const sent = c.sent.map((day: string) => ({ day }));
      expect(removableAfterSend(sent, c.deadlineDay).map((o) => o.day)).toEqual(c.removed);
    });
  }
});
