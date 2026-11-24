// ---------------------------------------------------------------------------
// The on-device pin store. When a workflow enables presence verification, the
// captured pin is saved LOCALLY (keyed by the org's user reference) so later
// app opens can evaluate "am I at the address?" without the coordinates ever
// leaving the phone. A small JSON file in the app's document directory via
// expo-file-system — loaded through the SDK's optional-module pattern, so a
// host app without the module simply has no presence tier (never a crash).
// ---------------------------------------------------------------------------

import { registerPresenceDevice } from './device';
import { readJsonFile, writeJsonFile } from './fs';
import { deviceOnly, secureStore, serially, type SecureStoreLike } from './secure-store';
import type { UserTokenProvider } from './user-token';

export interface StoredPin {
  lat: number;
  lng: number;
  savedAt: string;
  /** Always-on monitoring: the pin lives as long as the arrangement does
   *  (cleared only by clearPresencePin — revoke or sign-out), because the
   *  server keeps renewing the watch and reports must keep flowing. */
  alwaysOn?: boolean;
  /** `false` when the workflow switched background monitoring off for this
   *  check. Absent on pins saved before this was recorded: treated as on. */
  background?: false;
  /** The reporter has asked for "allow all the time" for this pin once
   *  (auto-arm.ts). It never asks again; a new pin starts clean. */
  backgroundAsked?: true;
  /** The Google Cloud project Play Integrity proofs are made for, copied from
   *  the server's config so a background report can prove itself. */
  playIntegrityProject?: string;
  /** From the 202 of the verification that captured this pin. It is what makes
   *  this phone's reports count as the watch's own device; without one they
   *  count at the foreground tier. Rolling chains keep the same token. Only
   *  here when the host has no expo-secure-store (or from a build before
   *  4.5.0, until it is moved): this file is in a backup. */
  presenceToken?: string;
}

const FILE_NAME = 'myaza-kyc-presence.json';

/**
 * How long a stored pin may drive reports. The watch it feeds resolves within
 * its policy window (30 days at the longest) and the server discards reports
 * for a resolved watch anyway — but the DEVICE kept sampling location on
 * every app open forever, for a check that had finished. The server cannot
 * say "stop" without breaking the ingest endpoint's enumeration safety (an
 * unknown user and a resolved watch must answer identically), so the bound
 * lives here: longest window plus resolution slack, then the pin self-expires
 * and the reporter goes quiet before ever touching the GPS.
 */
export const PIN_TTL_DAYS = 45;

/** The server refuses a body with a longer token, which would lose the report. */
const MAX_PRESENCE_TOKEN_LENGTH = 128;

export function pinExpired(pin: StoredPin, nowMs: number = Date.now()): boolean {
  // An always-on pin has no end date by design (the OkHi model): monitoring
  // continues until revoked, and the TTL below exists only for BOUNDED
  // watches whose purpose has a deadline.
  if (pin.alwaysOn === true) return false;
  const saved = Date.parse(pin.savedAt);
  // An unparseable stamp is treated as expired: both platforms have always
  // written savedAt, so a missing one is corruption, and corrupt entries must
  // age out rather than report forever.
  if (Number.isNaN(saved)) return true;
  // Strictly past the TTL — the Flutter mirror compares the same way.
  return nowMs - saved > PIN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function readAll(): Record<string, StoredPin> {
  return readJsonFile(FILE_NAME) as Record<string, StoredPin>;
}

function writeAll(pins: Record<string, StoredPin>): void {
  writeJsonFile(FILE_NAME, pins as Record<string, unknown>);
}

/** Saves the captured pin for later foreground reports. Never throws. */
export function savePresencePin(
  externalUserId: string,
  pin: { lat: number; lng: number },
  opts?: { alwaysOn?: boolean; background?: boolean; playIntegrityProject?: string | null },
): void {
  if (!externalUserId) return;
  const pins = readAll();
  pins[externalUserId] = {
    lat: pin.lat,
    lng: pin.lng,
    savedAt: new Date().toISOString(),
    ...(opts?.alwaysOn === true ? { alwaysOn: true } : {}),
    ...(opts?.background === false ? { background: false as const } : {}),
    ...(opts?.playIntegrityProject ? { playIntegrityProject: opts.playIntegrityProject } : {}),
  };
  writeAll(pins);
  // A new pin drops the token, wherever it is kept.
  void forgetSecureToken(externalUserId);
}

// ─── The HMAC presenceToken in device-only storage (design rev 4, R65) ──────
//
// The 202's token is what lets a report, or a device registration, stand as
// the watch's own phone. In myaza-kyc-presence.json it sat in the documents
// directory, which iCloud and Android backups copy, so a phone restored from
// a backup held it too. With expo-secure-store it now lives only in
// AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY storage: written there, read back, and
// only then taken out of the file (a one-time move for tokens kept by an
// older build). Without expo-secure-store it stays in the file, as before,
// so reports keep their standing; the SDK warns once in development.

const SECURE_KEY = 'toden.presence.hmacTokens';
let warnedNoSecureStore = false;

function warnNoSecureStore(): void {
  if (warnedNoSecureStore) return;
  warnedNoSecureStore = true;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(
      '[toden] presence: install expo-secure-store so the presence token is kept in device-only storage, not in a file that backups copy.',
    );
  }
}

type SecureMap = Record<string, string>;

async function readSecure(store: SecureStoreLike): Promise<SecureMap | 'locked'> {
  try {
    const raw = await store.getItemAsync(SECURE_KEY, deviceOnly(store));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as SecureMap) : {};
  } catch {
    // Before the first unlock the Keychain refuses.
    return 'locked';
  }
}

async function writeSecure(store: SecureStoreLike, map: SecureMap): Promise<boolean> {
  try {
    if (Object.keys(map).length === 0) await store.deleteItemAsync(SECURE_KEY, deviceOnly(store));
    else await store.setItemAsync(SECURE_KEY, JSON.stringify(map), deviceOnly(store));
    return true;
  } catch {
    return false;
  }
}

/** Writes the token, reads it back, and only then drops the file's copy. */
async function moveToSecure(store: SecureStoreLike, externalUserId: string, value: string): Promise<boolean> {
  const map = await readSecure(store);
  if (map === 'locked') return false;
  if (!(await writeSecure(store, { ...map, [externalUserId]: value }))) return false;
  const check = await readSecure(store);
  if (check === 'locked' || check[externalUserId] !== value) return false;
  dropFileToken(externalUserId);
  return true;
}

function dropFileToken(externalUserId: string): void {
  const pins = readAll();
  const pin = pins[externalUserId];
  if (!pin || pin.presenceToken === undefined) return;
  const { presenceToken: _dropped, ...rest } = pin;
  pins[externalUserId] = rest;
  writeAll(pins);
}

function forgetSecureToken(externalUserId: string): Promise<void> {
  return serially(async () => {
    const store = secureStore();
    if (!store) return;
    const map = await readSecure(store);
    if (map === 'locked' || !(externalUserId in map)) return;
    const { [externalUserId]: _dropped, ...rest } = map;
    await writeSecure(store, rest);
  });
}

/** Keeps the 202's token for the pin it belongs to. Saving a new pin drops
 *  it, so a token can only ever sit beside the capture that earned it. */
export function savePresenceToken(externalUserId: string, token: unknown): Promise<void> {
  if (typeof token !== 'string') return Promise.resolve();
  const value = token.trim();
  if (value === '' || value.length > MAX_PRESENCE_TOKEN_LENGTH) return Promise.resolve();
  return serially(async () => {
    if (!readAll()[externalUserId]) return;
    const store = secureStore();
    if (store && (await moveToSecure(store, externalUserId, value))) return;
    if (!store) warnNoSecureStore();
    // No secure store, or it refused: the file, as before 4.5.0.
    const pins = readAll();
    const pin = pins[externalUserId];
    if (!pin) return;
    pins[externalUserId] = { ...pin, presenceToken: value };
    writeAll(pins);
  });
}

/** Stores the 202's token for a flow that saved a pin, the same rule the pin
 *  was saved under. The 202 of any address capture carries a token, and one
 *  from a flow with presence off must not replace that of a check still running. */
export function keepPresenceToken(
  config: {
    userId?: string;
    apiKey?: string;
    devUrl?: string;
    getUserToken?: UserTokenProvider;
    addressCollection?: { presence?: { enabled?: boolean } } | null;
  },
  token: unknown,
): Promise<void> {
  if (config.addressCollection?.presence?.enabled === true && config.userId) {
    const userId = config.userId;
    return savePresenceToken(userId, token)
      .catch(() => undefined)
      .then(() => {
        // With a user-token provider, the phone's presence device registers
        // now too (device.ts), in the background: the flow never waits.
        if (typeof token === 'string' && token && config.apiKey) {
          void registerPresenceDevice({
            apiKey: config.apiKey,
            externalUserId: userId,
            presenceToken: token,
            ...(config.devUrl ? { devUrl: config.devUrl } : {}),
            ...(config.getUserToken ? { getUserToken: config.getUserToken } : {}),
          });
        }
      });
  }
  return Promise.resolve();
}

/** The user's token, none, or `locked`: kept in device-only storage that
 *  cannot be read before the phone's first unlock. */
export type PresenceTokenRead = { token: string | undefined; locked: boolean };

/** The token to send with this user's reports, if the pin has one. Read on
 *  every report rather than held in memory: the background tasks run with no
 *  React context and no state from the flow. A token an older build left in
 *  the file is moved to device-only storage on the way through. */
export function presenceTokenFor(externalUserId: string): Promise<PresenceTokenRead> {
  return serially(async () => {
    const fileCopy = readAll()[externalUserId]?.presenceToken;
    const store = secureStore();
    if (!store) {
      if (fileCopy) warnNoSecureStore();
      return { token: fileCopy, locked: false };
    }
    const map = await readSecure(store);
    if (map === 'locked') return { token: fileCopy, locked: fileCopy === undefined };
    const kept = map[externalUserId];
    if (kept) {
      if (fileCopy !== undefined) dropFileToken(externalUserId);
      return { token: kept, locked: false };
    }
    if (fileCopy) await moveToSecure(store, externalUserId, fileCopy);
    return { token: fileCopy, locked: false };
  });
}

/** Records that the reporter asked for "allow all the time" for this pin. */
export function markBackgroundAsked(externalUserId: string): void {
  const pins = readAll();
  const pin = pins[externalUserId];
  if (!pin || pin.backgroundAsked === true) return;
  pins[externalUserId] = { ...pin, backgroundAsked: true };
  writeAll(pins);
}

/** The stored pin for a user, or null (no store / never captured here /
 *  aged out — an expired pin is cleared on the way through). */
export function loadPresencePin(externalUserId: string): StoredPin | null {
  const pin = readAll()[externalUserId];
  if (!pin || typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return null;
  if (pinExpired(pin)) {
    clearPresencePin(externalUserId);
    return null;
  }
  return pin;
}

/** Drops a stored pin (e.g. after a watch resolves or the user signs out). */
export function clearPresencePin(externalUserId: string): void {
  const pins = readAll();
  if (externalUserId in pins) {
    delete pins[externalUserId];
    writeAll(pins);
  }
  void forgetSecureToken(externalUserId);
}
