// ---------------------------------------------------------------------------
// The on-device pin store. When a workflow enables presence verification, the
// captured pin is saved LOCALLY (keyed by the org's user reference) so later
// app opens can evaluate "am I at the address?" without the coordinates ever
// leaving the phone. A small JSON file in the app's document directory via
// expo-file-system — loaded through the SDK's optional-module pattern, so a
// host app without the module simply has no presence tier (never a crash).
// ---------------------------------------------------------------------------

import { readJsonFile, writeJsonFile } from './fs';

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
   *  count at the foreground tier. Rolling chains keep the same token. */
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
}

/** Keeps the 202's token beside the pin it belongs to. Saving a new pin drops
 *  it, so a token can only ever sit beside the capture that earned it. */
export function savePresenceToken(externalUserId: string, token: unknown): void {
  if (typeof token !== 'string') return;
  const value = token.trim();
  if (value === '' || value.length > MAX_PRESENCE_TOKEN_LENGTH) return;
  const pins = readAll();
  const pin = pins[externalUserId];
  if (!pin) return;
  pins[externalUserId] = { ...pin, presenceToken: value };
  writeAll(pins);
}

/** Stores the 202's token for a flow that saved a pin, the same rule the pin
 *  was saved under. The 202 of any address capture carries a token, and one
 *  from a flow with presence off must not replace that of a check still running. */
export function keepPresenceToken(
  config: { userId?: string; addressCollection?: { presence?: { enabled?: boolean } } | null },
  token: unknown,
): void {
  if (config.addressCollection?.presence?.enabled === true && config.userId) {
    savePresenceToken(config.userId, token);
  }
}

/** The token to send with this user's reports, if the pin has one. Read on
 *  every report rather than held in memory: the background tasks run with no
 *  React context and no state from the flow. */
export function presenceTokenFor(externalUserId: string): string | undefined {
  return readAll()[externalUserId]?.presenceToken;
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
}
