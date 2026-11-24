// ---------------------------------------------------------------------------
// Waiting for the watch. The server mints an AddressWatch in the post-terminal
// hook chain, seconds AFTER a submission is accepted, and its ingest is
// enumeration-safe by contract: an observation for a user with no live watch
// answers `accepted: 0` exactly as an unknown user would, and is dropped. So
// a report made the moment onSubmit fires — the natural place for a host to
// make one — landed on nothing (iPhone + S24, 2026-09-07: three watches in a
// row lapsed INCONCLUSIVE with zero observations while both phones sat at the
// pin). The reporter therefore asks where the watch stands before it posts,
// and when the pin was captured minutes ago it WAITS for the watch to appear,
// bounded, rather than posting into the gap. Mirrors the Flutter SDK's
// presence_watch_wait.dart — keep the two in lockstep.
// ---------------------------------------------------------------------------

import { resolveBaseUrl } from '../services/resolveUrl';
import { sendWithUserToken, type UserTokenErrorCode, type UserTokenProvider } from './user-token';

/** A pin saved this recently was captured by a flow whose watch may still be minting. */
export const FRESH_PIN_MS = 15 * 60 * 1000;
/** How long a submit-time report waits for its watch before giving up. */
export const WATCH_WAIT_MS = 90 * 1000;
export const WATCH_POLL_MS = 3 * 1000;

export type WatchPresence = 'live' | 'absent' | 'unknown';

export function pinIsFresh(pin: { savedAt: string }, nowMs: number = Date.now()): boolean {
  const saved = Date.parse(pin.savedAt);
  return !Number.isNaN(saved) && nowMs - saved <= FRESH_PIN_MS;
}

/** What the server says about the user's watch. */
export interface WatchState {
  status: string;
  /** The organisation (or Myaza) stopped monitoring and nothing has started since. */
  stopped: boolean;
}

/**
 * Whether the phone should stop its own side of monitoring: the server says
 * it was stopped, and the pin is not fresh. A fresh pin belongs to a flow
 * that has just submitted, whose new watch is still being minted, so the
 * status read is still describing the one before it.
 */
export function shouldStandDown(state: WatchState | null, fresh: boolean): boolean {
  return !fresh && state?.stopped === true;
}

/** The server's public status for the user's watch, or null when it could not be read. */
export async function fetchWatchStatus(
  apiKey: string,
  devUrl: string | undefined,
  externalUserId: string,
  getUserToken?: UserTokenProvider,
): Promise<string | null> {
  return (await fetchWatchState(apiKey, devUrl, externalUserId, getUserToken))?.status ?? null;
}

export async function fetchWatchState(
  apiKey: string,
  devUrl: string | undefined,
  externalUserId: string,
  getUserToken?: UserTokenProvider,
): Promise<WatchState | null> {
  return (await readWatch(apiKey, devUrl, externalUserId, getUserToken)).state;
}

/** The status read, and why it failed when a user token is the reason. */
export interface WatchRead {
  state: WatchState | null;
  refusal: UserTokenErrorCode | null;
}

export async function readWatch(
  apiKey: string,
  devUrl: string | undefined,
  externalUserId: string,
  getUserToken?: UserTokenProvider,
): Promise<WatchRead> {
  try {
    const base = resolveBaseUrl(apiKey, devUrl);
    const sent = await sendWithUserToken(
      { apiKey, externalUserId, purpose: 'presence', ...(getUserToken ? { getUserToken } : {}) },
      (headers) =>
        fetch(`${base}/api/v1/address/presence/${encodeURIComponent(externalUserId)}`, {
          headers: { Authorization: `Bearer ${apiKey}`, ...headers },
        }),
    );
    const response = sent.response;
    if (sent.refusal || !response || !response.ok) return { state: null, refusal: sent.refusal };
    const body = (await response.json()) as { status?: unknown; stopped?: unknown };
    if (typeof body.status !== 'string') return { state: null, refusal: null };
    // An older server sends no flag: a revoked check is the one stop it reports.
    return {
      state: { status: body.status, stopped: body.stopped === true || body.status === 'revoked' },
      refusal: null,
    };
  } catch {
    return { state: null, refusal: null };
  }
}

export interface AwaitWatchDeps {
  fetchStatus: () => Promise<string | null>;
  /** True ends the wait now (a user-token refusal: waiting will not fix it). */
  stop?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  waitMs?: number;
  pollMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Whether a live watch exists to receive a report. Only `in_progress` is
 * live: a resolved cycle, or none at all, drops what is posted. An
 * unreadable status is `unknown`, and the post goes ahead — a network doubt
 * must not silence a report the server might accept. A FRESH pin changes the
 * rule: its watch is probably still being minted (or the previous cycle has
 * just lapsed and the new one is about to replace it), so the status is
 * re-read until it turns live or the wait runs out.
 */
export async function awaitWatch(fresh: boolean, deps: AwaitWatchDeps): Promise<WatchPresence> {
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.waitMs ?? WATCH_WAIT_MS);
  const pollMs = deps.pollMs ?? WATCH_POLL_MS;
  for (;;) {
    const status = await deps.fetchStatus();
    if (status === 'in_progress') return 'live';
    if (deps.stop?.()) return 'unknown';
    if (!fresh) return status === null ? 'unknown' : 'absent';
    if (now() >= deadline) return status === null ? 'unknown' : 'absent';
    await sleep(pollMs);
  }
}
