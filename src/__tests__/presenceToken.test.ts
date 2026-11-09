import { readFileSync } from 'fs';
import { resolve } from 'path';

import { postObservations } from '../presence/post';
import { keepPresenceToken, loadPresencePin, presenceTokenFor, savePresencePin, savePresenceToken } from '../presence/store';

// The presence token proves a report comes from the phone that captured the
// pin. It arrives in the 202, after the pin was saved, and every report sends
// it. Ported by the Flutter SDK's presence_token_test.dart.

jest.mock('../presence/fs', () => {
  const files: Record<string, Record<string, unknown>> = {};
  return {
    readJsonFile: (name: string) => JSON.parse(JSON.stringify(files[name] ?? {})),
    writeJsonFile: (name: string, value: Record<string, unknown>) => {
      files[name] = value;
    },
  };
});

const pin = { lat: 6.4281, lng: 3.4219 };

describe('savePresenceToken', () => {
  it('keeps the token beside the pin', () => {
    savePresencePin('user_keep', pin);
    savePresenceToken('user_keep', 'tok_1');
    expect(loadPresencePin('user_keep')?.presenceToken).toBe('tok_1');
    expect(presenceTokenFor('user_keep')).toBe('tok_1');
  });

  it('does nothing without a pin', () => {
    savePresenceToken('user_none', 'tok_1');
    expect(loadPresencePin('user_none')).toBeNull();
    expect(presenceTokenFor('user_none')).toBeUndefined();
  });

  it('a new capture drops the old token', () => {
    savePresencePin('user_new', pin);
    savePresenceToken('user_new', 'tok_1');
    savePresencePin('user_new', pin);
    expect(presenceTokenFor('user_new')).toBeUndefined();
  });

  it('ignores a value the server would refuse', () => {
    savePresencePin('user_bad', pin);
    savePresenceToken('user_bad', undefined);
    savePresenceToken('user_bad', '  ');
    savePresenceToken('user_bad', 'x'.repeat(129));
    expect(presenceTokenFor('user_bad')).toBeUndefined();
  });
});

describe('keepPresenceToken', () => {
  const presence = { userId: 'user_flow', addressCollection: { presence: { enabled: true } } };

  it('stores it for a presence flow', () => {
    savePresencePin('user_flow', pin);
    keepPresenceToken(presence, 'tok_1');
    expect(presenceTokenFor('user_flow')).toBe('tok_1');
  });

  it('a flow with presence off leaves a running check its own token', () => {
    savePresencePin('user_running', pin);
    savePresenceToken('user_running', 'tok_1');
    keepPresenceToken({ userId: 'user_running', addressCollection: {} }, 'tok_2');
    expect(presenceTokenFor('user_running')).toBe('tok_1');
  });
});

describe('postObservations', () => {
  const observation = { day: '2026-11-01', source: 'geofence' as const, dwellMinutes: 40, nightPresent: true, samples: 1 };
  const realFetch = globalThis.fetch;
  const bodyOf = (mock: jest.Mock) => JSON.parse((mock.mock.calls[0][1] as { body: string }).body);
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('sends the token every tier reports through', async () => {
    savePresencePin('user_post', pin);
    savePresenceToken('user_post', 'tok_1');
    await postObservations('pk_test_1', 'http://localhost:3001', 'user_post', [observation]);
    expect(bodyOf(fetchMock)).toEqual({
      externalUserId: 'user_post',
      presenceToken: 'tok_1',
      observations: [observation],
    });
  });

  it('leaves it out when the pin has none, as an older pin does', async () => {
    savePresencePin('user_old', pin);
    await postObservations('pk_test_1', 'http://localhost:3001', 'user_old', [observation]);
    expect(bodyOf(fetchMock)).not.toHaveProperty('presenceToken');
  });
});

describe('the submit', () => {
  it('stores the token before the result reaches the submitted screen', () => {
    const store = readFileSync(resolve(__dirname, '../store/verificationStore.ts'), 'utf8');
    const kept = store.indexOf('keepPresenceToken(state.config, res.presenceToken)');
    expect(kept).toBeGreaterThan(-1);
    expect(kept).toBeLessThan(store.indexOf('submissionResult: result'));
  });
});

describe('the contact step', () => {
  it('names the session on the send and sizes the field from the response', () => {
    const step = readFileSync(resolve(__dirname, '../screens/ContactVerificationStep.tsx'), 'utf8');
    expect(step).toContain('...(sessionId ? { sessionId } : {})');
    expect(step).toContain('setSentLength(sentCodeLength(res.codeLength, configuredLength))');
  });
});
