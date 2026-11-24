// ---------------------------------------------------------------------------
// The FOREGROUND presence reporter — the default tier, no background
// permission. The host app calls reportAddressPresence() on app open, or the
// moment the flow submits (watch-wait.ts makes that safe: the watch is minted
// seconds after the submission is accepted, and a fresh pin waits for it);
// the SDK takes one while-in-use fix, evaluates the fence ON-DEVICE against
// the pin stored at capture, and posts a single per-day aggregate. Everything is best-effort: a denied permission, a missing pin, or
// a network fault returns a reason, never a throw — a presence report must
// never break the host app's startup path.
// ---------------------------------------------------------------------------

import * as Location from 'expo-location';
import { currentPosition } from '../services/location';
import { insideFence, localDayAndNight } from './math';
import { recordCheckIn } from './checkin';
import { sendObservations } from './post';
import { flushPendingObservations } from './flush';
import {
  cachedUserToken,
  rekeepUserToken,
  sendWithUserToken,
  userTokenProvider,
  type UserTokenProvider,
} from './user-token';
import { loadPresencePin } from './store';
import { standDownPresence } from './stand-down';
import { maybeArmBackground } from './auto-arm';
import type { EnableBackgroundResult } from './background';
import { awaitWatch, pinIsFresh, readWatch, shouldStandDown, type WatchState } from './watch-wait';

export interface ReportPresenceOptions {
  /** The org's PUBLISHABLE key (the same one the KYC flow mounts with). */
  apiKey: string;
  /** The org's user reference — must match the KYC flow's `userId`. */
  externalUserId: string;
  /** Dev-server override, exactly like the SDK config's `devUrl`. */
  devUrl?: string;
  /**
   * The reporter switches background monitoring on for a person whose check
   * is running without it, asking for "allow all the time" once. Pass `false`
   * to do that yourself with `enableBackgroundPresence()`, at a moment you
   * choose. Default `true`.
   */
  autoBackground?: boolean;
  /**
   * With a scoped publishable key: asks your server for a user token for the
   * signed-in user (it gets no user id from the SDK). Your server mints it
   * with `POST /user-tokens/presence` and a secret key. Omit it with a legacy
   * key; or call `setUserTokenProvider` once instead.
   */
  getUserToken?: UserTokenProvider;
}

export interface ReportPresenceResult {
  reported: boolean;
  /** Whether the fix landed inside the fence (null when nothing was reported). */
  inside: boolean | null;
  reason:
    | 'reported'
    | 'no_pin'
    | 'services_off'
    | 'no_fix'
    | 'outside_fence'
    /** Nothing is monitoring this user right now, so a report would be dropped. */
    | 'no_watch'
    /** The organisation stopped monitoring. Background location was switched
     *  off for this user and the stored pin forgotten. */
    | 'stopped'
    | 'network_error'
    /** A scoped publishable key needs a user token, and none was given. */
    | 'user_token_required'
    /** The server refused the user token, after one new token and one retry. */
    | 'user_token_invalid'
    /** The provider's token is for another user or purpose, or expired: nothing was sent. */
    | 'user_token_mismatch'
    /** The publishable key is limited to workflows and cannot use presence. */
    | 'scope_not_declared';
  /** Set when this report tried to switch background monitoring on. */
  background?: EnableBackgroundResult;
}

export async function reportAddressPresence(
  options: ReportPresenceOptions,
): Promise<ReportPresenceResult> {
  // What the arming step did rides whichever answer the report ends on.
  const arm: { background?: EnableBackgroundResult } = {};
  const result = await report(options, arm);
  return arm.background ? { ...result, background: arm.background } : result;
}

async function report(
  options: ReportPresenceOptions,
  arm: { background?: EnableBackgroundResult },
): Promise<ReportPresenceResult> {
  const pin = loadPresencePin(options.externalUserId);
  if (!pin) return { reported: false, inside: null, reason: 'no_pin' };

  // Asked before anything touches location: when the organisation has stopped
  // monitoring, the phone stops too (stand-down.ts), and takes no fix at all.
  const fresh = pinIsFresh(pin);
  let refusal: ReportPresenceResult['reason'] | null = null;
  const read = async (): Promise<WatchState | null> => {
    const answer = await readWatch(options.apiKey, options.devUrl, options.externalUserId, options.getUserToken);
    if (answer.refusal) refusal = answer.refusal;
    return answer.state;
  };
  let known = fresh ? undefined : await read();
  // A user-token refusal is not a stopped watch, and waiting will not fix it.
  if (refusal) return { reported: false, inside: null, reason: refusal };
  if (shouldStandDown(known ?? null, fresh)) {
    await standDownPresence(options.externalUserId);
    return { reported: false, inside: null, reason: 'stopped' };
  }

  // A check running without background monitoring gets it switched on here,
  // once (auto-arm.ts): this call is the only one an existing app makes.
  const armed = await maybeArmBackground(options, pin, known ?? null, fresh);
  if (armed) arm.background = armed;

  // The phone's location toggle, checked before the permission dance: off,
  // every fix fails, and `no_fix` told the host nothing about why.
  const services = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!services) return { reported: false, inside: null, reason: 'services_off' };

  const fix = await currentPosition();
  if (!fix) return { reported: false, inside: null, reason: 'no_fix' };

  const inside = insideFence(pin, fix);
  // An outside fix is NOT evidence of absence (people go to work) — the server
  // scores presence, never absence — so there is nothing worth sending.
  if (!inside && fix.mocked !== true) {
    return { reported: false, inside: false, reason: 'outside_fence' };
  }

  // An inside reading is also a "still here" check-in for the background
  // tier: a stay it is tracking is recorded now rather than when they leave.
  // A no-op when the background tier is not enabled.
  if (inside && fix.mocked !== true) await recordCheckIn(options.externalUserId, fix);

  // The watch is minted seconds after a submission is accepted, and the
  // ingest drops a report that arrives before it (watch-wait.ts).
  const watch = await awaitWatch(fresh, {
    // The read made above is used once, so an old pin costs one request.
    fetchStatus: async () => {
      const state = known !== undefined ? known : await read();
      known = undefined;
      return state?.status ?? null;
    },
    stop: () => refusal !== null,
  });
  // A refusal ends the wait at once: polling 90 seconds would not fix it.
  if (refusal) return { reported: false, inside, reason: refusal };
  if (watch === 'absent') return { reported: false, inside, reason: 'no_watch' };

  const { day, nightPresent } = localDayAndNight();
  // One wire path for both tiers (post.ts) — the request shape cannot fork.
  const observation = {
    day,
    source: 'foreground' as const,
    dwellMinutes: 0,
    nightPresent,
    samples: 1,
    // A mocked fix is REPORTED, flagged — evidence OF fraud is worth
    // more to the watch than silence.
    ...(fix.mocked === true ? { integrity: { mockLocation: true } } : {}),
  };
  const sent = await sendWithUserToken(
    {
      apiKey: options.apiKey,
      externalUserId: options.externalUserId,
      purpose: 'presence',
      ...(options.getUserToken ? { getUserToken: options.getUserToken } : {}),
    },
    (headers) => sendObservations(options.apiKey, options.devUrl, options.externalUserId, [observation], headers),
  );
  if (sent.refusal) return { reported: false, inside, reason: sent.refusal };
  // With a token in hand, the days the background held while it had none go
  // now, and the background's stored copy is replaced (it may be stale).
  const held = options.getUserToken ?? userTokenProvider() ? cachedUserToken(options.externalUserId, 'presence') : null;
  if (held) {
    await rekeepUserToken(held);
    await flushPendingObservations(options.externalUserId, held.token);
  }
  if (!sent.response?.ok) return { reported: false, inside, reason: 'network_error' };
  return { reported: true, inside, reason: 'reported' };
}
