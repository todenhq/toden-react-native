// ---------------------------------------------------------------------------
// The background queue's one flush, shared by the geofence task, the
// foreground-service task and check-ins (it used to be three copies).
//
// Rules (Toden design 0020, section 14), the same on iOS and Android:
//   - Oldest day first, at most 31 days per request (the server's limit).
//   - 2xx: that chunk leaves the queue (the server ignores days outside the
//     watch window itself). 400: that chunk can never succeed, so it is
//     dropped. Anything else: the queue is kept and the flush stops; a token
//     that was sent is marked stale so the app fetches a new one when opened.
//   - Days are never dropped by age alone.
//   - User tokens not in use: the post is exactly 4.4.0's, without the header.
//     In use: no fresh token, no post, queue kept (secure-token.ts).
// ---------------------------------------------------------------------------

import { loadHeldDeadline, loadReporterConfig, pendingObservations, replacePending } from './background-store';
import { refreshIfDue, sealerFor } from './device';
import { removableAfterSend } from './device-rules';
import { sendObservations, type WireObservation } from './post';
import { backgroundTokenFor, markStoredUserTokenStale, type BackgroundToken } from './secure-token';
import { markUserTokenStale, userTokenHeaders } from './user-token';

/** The server's `observations` maximum. */
export const FLUSH_CHUNK_DAYS = 31;

/** PURE. The queue in posting order: oldest day first, 31 days a request. */
export function flushChunks<T extends { day: string }>(queue: readonly T[]): T[][] {
  const sorted = [...queue].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const chunks: T[][] = [];
  for (let i = 0; i < sorted.length; i += FLUSH_CHUNK_DAYS) chunks.push(sorted.slice(i, i + FLUSH_CHUNK_DAYS));
  return chunks;
}

export type ChunkOutcome = 'sent' | 'drop' | 'keep';

/** PURE. What one answer means for its chunk. `null`: nothing came back. */
export function chunkOutcome(status: number | null): ChunkOutcome {
  if (status != null && status >= 200 && status < 300) return 'sent';
  if (status === 400) return 'drop';
  return 'keep';
}

export interface FlushRun<T> {
  /** What is still queued, oldest first. */
  remaining: T[];
  /** The server answered with a refusal (not 2xx, not 400). */
  refused: boolean;
  /** Taken by a 2xx. On a held watch only some may leave the queue. */
  sent: T[];
  /** Refused with a 400, which can never succeed. */
  dropped: T[];
}

/** Posts chunk by chunk until one is kept. `post` answers the status, or null. */
export async function runFlush<T extends { day: string }>(
  queue: readonly T[],
  post: (chunk: T[]) => Promise<number | null>,
): Promise<FlushRun<T>> {
  const chunks = flushChunks(queue);
  const sent: T[] = [];
  const dropped: T[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const status = await post(chunk);
    const outcome = chunkOutcome(status);
    if (outcome === 'drop' && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[toden] presence: the server refused ${chunk.length} queued days (400); dropped`);
    }
    if (outcome === 'keep') return { remaining: chunks.slice(i).flat(), refused: status != null, sent, dropped };
    (outcome === 'sent' ? sent : dropped).push(...chunk);
  }
  return { remaining: [], refused: false, sent, dropped };
}

const keyOf = (o: WireObservation) => JSON.stringify(o);

/**
 * Flush this user's background queue. Never throws. Days queued while the
 * requests were out stay queued. A foreground caller passes the token it has
 * just checked, so the queue goes even when secure storage is unavailable;
 * the headless tasks pass none and decide from the stores.
 */
export async function flushPendingObservations(userId: string, checkedToken?: string): Promise<void> {
  try {
    const cfg = loadReporterConfig(userId);
    if (!cfg) return;
    const pending = pendingObservations(userId);
    if (pending.length === 0) return;
    let decision: BackgroundToken = checkedToken
      ? { kind: 'use', token: checkedToken }
      : await backgroundTokenFor(userId);
    // No usable token: a registered presence device signs for a fresh one.
    if (decision.kind === 'skip' && (await refreshIfDue(userId, cfg))) decision = await backgroundTokenFor(userId);
    if (decision.kind === 'skip') return;
    const token = decision.kind === 'use' ? decision.token : null;
    // Seals are read only beside a user token: a post without one is 4.4.0's.
    const seal = token ? await sealerFor(userId) : null;
    const run = await runFlush(pending, async (chunk) => {
      const headers = userTokenHeaders(token);
      const response = seal
        ? await sendObservations(cfg.apiKey, cfg.devUrl, userId, chunk, headers, seal)
        : await sendObservations(cfg.apiKey, cfg.devUrl, userId, chunk, headers);
      return response ? response.status : null;
    });
    if (run.refused && token) {
      markUserTokenStale(userId, 'presence', token);
      await markStoredUserTokenStale(userId, token);
    }
    // On a watch held past its deadline, days after it stay queued: a
    // reviewer's extension may still let them count.
    const gone = [...removableAfterSend(run.sent, loadHeldDeadline(userId)), ...run.dropped];
    const posted = new Set(gone.map(keyOf));
    if (posted.size === 0) return;
    replacePending(
      userId,
      pendingObservations(userId).filter((o) => !posted.has(keyOf(o))),
    );
  } catch {
    // Best-effort: the queue is kept and the next event retries it.
  }
}
