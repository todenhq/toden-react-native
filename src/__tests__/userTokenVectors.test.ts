import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { flushChunks, runFlush } from '../presence/flush';
import { backgroundUserToken, type StoredTokenRead } from '../presence/secure-token';
import {
  USER_TOKEN_HEADER,
  checkUserToken,
  resetUserTokens,
  sendWithUserToken,
  userTokenRefusal,
  type UserTokenPurpose,
} from '../presence/user-token';

// The shared user-token cases (sdk-flutter/test/user_token_vectors.json),
// replayed here as the Dart, XCTest and JVM suites replay them.

jest.mock('../presence/fs', () => ({ readJsonFile: () => ({}), writeJsonFile: () => undefined }));

// The cases live in the Flutter package, so they exist only in the monorepo.
// The public toden-react-native repo, where the npm publish runs its tests, has
// no sdk-flutter beside it: reading them there failed the 4.5.0 publish. There
// each group is replaced by one skipped placeholder and its body never runs: a
// group whose body ran with no cases would still register its beforeEach, which
// Jest refuses in a group with no tests. The monorepo's CI runs every case.
const VECTORS = resolve(__dirname, '../../../sdk-flutter/test/user_token_vectors.json');
const HAS_VECTORS = existsSync(VECTORS);
/** A group of shared cases, or a skipped placeholder outside the monorepo. */
const describeShared = (name: string, body: () => void) =>
  HAS_VECTORS
    ? describe(name, body)
    : describe.skip(name, () => {
        it('runs in the monorepo, beside sdk-flutter', () => undefined);
      });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vectors: any = HAS_VECTORS ? JSON.parse(readFileSync(VECTORS, 'utf8')) : {};

describeShared('shared user-token vectors', () => {
  it('names the header the server reads', () => {
    expect(USER_TOKEN_HEADER).toBe(vectors.header);
  });

  describe('identity check', () => {
    for (const v of vectors.identity) {
      it(v.name, () => {
        const checked = checkUserToken(
          v.body,
          { externalUserId: v.actingFor, purpose: v.purpose as UserTokenPurpose, apiKey: v.apiKey },
          vectors.nowMillis,
        );
        expect(checked ? 'ok' : 'user_token_mismatch').toBe(v.expected);
      });
    }
  });

  describe('refusal codes', () => {
    for (const v of vectors.refusals) {
      it(v.name, () => {
        expect(userTokenRefusal(v.body)).toBe(v.code);
      });
    }
  });

  describe('foreground: one new token, one retry', () => {
    beforeEach(() => resetUserTokens());

    for (const v of vectors.foreground) {
      it(v.name, async () => {
        const tokens = ['A', 'B', 'C'].map((c) => `ut_test_${c.repeat(43)}`);
        let calls = 0;
        const provider = jest.fn(async () => ({
          token: tokens[calls++]!,
          externalUserId: 'cus_123',
          purpose: 'presence',
          expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
        }));
        const sentHeaders: (string | null)[] = [];
        let request = 0;
        const sent = await sendWithUserToken(
          {
            apiKey: 'pk_test_abc',
            externalUserId: 'cus_123',
            purpose: 'presence',
            ...(v.provider ? { getUserToken: provider } : {}),
          },
          async (headers) => {
            sentHeaders.push(headers[USER_TOKEN_HEADER] ?? null);
            const answer = v.responses[request++];
            const body = answer.code ? { error: { type: 'PERMISSION_ERROR', code: answer.code } } : {};
            return new Response(JSON.stringify(body), { status: answer.status });
          },
        );
        expect(sentHeaders).toEqual(v.headers);
        expect(request).toBe(v.requests);
        expect(provider).toHaveBeenCalledTimes(v.providerCalls);
        const outcome = sent.refusal ?? (sent.response?.ok ? 'ok' : 'error');
        expect(outcome).toBe(v.outcome);
      });
    }
  });

  describe('background flush', () => {
    for (const v of vectors.background) {
      it(v.name, async () => {
        const inUse = v.token !== null;
        const read: StoredTokenRead = v.token === 'missing' ? null : v.token === 'locked' ? 'locked' : v.token;
        const decision = backgroundUserToken(inUse, read, 'cus_123', vectors.nowMillis);
        const queue = (v.queue as string[]).map((day) => ({ day }));
        const posts: string[][] = [];
        const headers: (string | null)[] = [];
        let stale = typeof v.token === 'object' && v.token !== null ? v.token.stale === true : false;
        let remaining = queue.map((o) => o.day);
        if (decision.kind !== 'skip') {
          const token = decision.kind === 'use' ? decision.token : null;
          let i = 0;
          const run = await runFlush(queue, async (chunk) => {
            posts.push(chunk.map((o) => o.day));
            headers.push(token);
            const status = v.responses[i++];
            return status === 0 ? null : status;
          });
          remaining = run.remaining.map((o) => o.day);
          if (run.refused && token) stale = true;
        }
        expect(posts).toEqual(v.posts);
        for (const h of headers) expect(h).toBe(v.header);
        expect([...remaining].sort()).toEqual([...v.remaining].sort());
        expect(stale).toBe(v.stale);
      });
    }
  });
});

describeShared('flushChunks', () => {
  it('sorts by day and cuts at the chunk size', () => {
    const chunks = flushChunks(vectors.background[0].queue.map((day: string) => ({ day })));
    expect(chunks.map((c) => c.length)).toEqual([vectors.chunkDays, 40 - vectors.chunkDays]);
    expect(chunks[0]![0]!.day < chunks[1]![0]!.day).toBe(true);
  });
});
