// ---------------------------------------------------------------------------
// The presence user token, kept for the headless background flush.
//
// The background task runs with no React context and never calls the host's
// provider, so the last accepted presence token is kept here, in
// expo-secure-store with AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: device-only, not
// in a backup, and never in myaza-kyc-presence.json (the documents directory,
// which IS backed up). expo-secure-store is an optional peer, loaded with the
// require-in-try pattern of fs.ts: without it, background reports wait for the
// next time the app is opened, when the foreground flushes them.
//
// Whether user tokens are in use for a user is a plain flag in the background
// store (not a secret). Without it, the background flush posts exactly as 4.4.0
// did; with it, a missing, expired, stale or unreadable token means no post and
// the queue is kept. A biometric token is never kept anywhere.
// Mirrors PresenceStore.swift (Keychain) and PresenceStore.kt (noBackupFilesDir).
// ---------------------------------------------------------------------------

import { saveUserTokensInUse, userTokensInUse } from './background-store';
import { deviceOnly as options, secureStore } from './secure-store';
import { onUserTokenAccepted, type CheckedUserToken } from './user-token';

const KEY = 'toden.presence.userToken';

export interface StoredUserToken {
  externalUserId: string;
  token: string;
  expiresAtMillis: number;
  stale: boolean;
}

/** A stored token, none, or a store that cannot be read right now (locked, or absent). */
export type StoredTokenRead = StoredUserToken | null | 'locked';

export type BackgroundToken = { kind: 'none' } | { kind: 'use'; token: string } | { kind: 'skip' };

/**
 * PURE. What the background flush does about a user token. `inUse` false:
 * nothing changes from 4.4.0 (no header). In use: only a fresh token for this
 * user is sent; anything else skips the post and keeps the queue.
 */
export function backgroundUserToken(
  inUse: boolean,
  read: StoredTokenRead,
  externalUserId: string,
  nowMs: number,
): BackgroundToken {
  if (!inUse) return { kind: 'none' };
  if (read === null || read === 'locked') return { kind: 'skip' };
  if (read.externalUserId !== externalUserId || read.stale) return { kind: 'skip' };
  if (!(nowMs < read.expiresAtMillis)) return { kind: 'skip' };
  return { kind: 'use', token: read.token };
}

function parse(raw: string | null): StoredUserToken | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredUserToken>;
    if (typeof v.externalUserId !== 'string' || typeof v.token !== 'string') return null;
    if (typeof v.expiresAtMillis !== 'number') return null;
    return { externalUserId: v.externalUserId, token: v.token, expiresAtMillis: v.expiresAtMillis, stale: v.stale === true };
  } catch {
    return null;
  }
}

export async function readStoredUserToken(): Promise<StoredTokenRead> {
  const store = secureStore();
  if (!store) return 'locked';
  try {
    return parse(await store.getItemAsync(KEY, options(store)));
  } catch {
    // Before the first unlock the Keychain refuses; the queue waits.
    return 'locked';
  }
}

async function write(value: StoredUserToken): Promise<boolean> {
  const store = secureStore();
  if (!store) return false;
  try {
    await store.setItemAsync(KEY, JSON.stringify(value), options(store));
    return true;
  } catch {
    return false;
  }
}

/** Keep an accepted presence token for the background flush, and mark tokens in use. */
export async function keepPresenceUserToken(token: CheckedUserToken): Promise<void> {
  if (token.purpose !== 'presence') return;
  saveUserTokensInUse(token.externalUserId, true);
  await write({
    externalUserId: token.externalUserId,
    token: token.token,
    expiresAtMillis: token.expiresAtMs,
    stale: false,
  });
}

/**
 * The server refused `token`: the background waits for a new one. Only that
 * token: one a silent push stored while the refused flush was out stays good.
 */
export async function markStoredUserTokenStale(externalUserId: string, token: string): Promise<void> {
  const read = await readStoredUserToken();
  if (read === null || read === 'locked' || read.externalUserId !== externalUserId) return;
  if (read.token !== token) return;
  await write({ ...read, stale: true });
}

/** Logout or stand-down: forget the token and the flag. Never throws. */
export async function clearStoredUserToken(externalUserId: string): Promise<void> {
  saveUserTokensInUse(externalUserId, false);
  const store = secureStore();
  if (!store) return;
  try {
    const read = parse(await store.getItemAsync(KEY, options(store)));
    if (read && read.externalUserId !== externalUserId) return;
    await store.deleteItemAsync(KEY, options(store));
  } catch {
    // Locked: the flag is already off, so nothing will send it.
  }
}

/** The background flush's token decision for this user, read from the stores. */
export async function backgroundTokenFor(externalUserId: string, nowMs: number = Date.now()): Promise<BackgroundToken> {
  const inUse = userTokensInUse(externalUserId);
  if (!inUse) return { kind: 'none' };
  return backgroundUserToken(inUse, await readStoredUserToken(), externalUserId, nowMs);
}

// Every presence token the SDK accepts in the foreground is kept for the background.
onUserTokenAccepted(keepPresenceUserToken);
