// Persistence for the background geofence tier: the open ENTER timestamp,
// the unflushed per-day queue, and the wire config the headless task needs
// (it runs with no React context, so apiKey/devUrl are persisted beside the
// pin — the key is publishable by design). Kept apart from the pin store so
// each file stays small and the pin's own lifecycle rules stay untangled
// from flush bookkeeping.

import { readJsonFile, writeJsonFile } from './fs';
import { stampChanged, type QueuedObservation } from './device-rules';
import type { WireObservation } from './post';

const FILE_NAME = 'myaza-kyc-presence-bg.json';

interface BgRecord {
  enterAt?: number | null;
  /** When the open stay began; `enterAt` moves on at each check-in. */
  stayStart?: number | null;
  pending?: WireObservation[];
  config?: { apiKey: string; devUrl?: string };
  serviceUser?: string;
  /** User tokens are in use for this user (the token itself is in secure-token.ts). */
  userTokens?: boolean;
  /** Server minus device, from the presence device's last core answer (device.ts). */
  clockOffset?: number;
  /** The watch's deadline day while it is in progress past it (watch-status.ts). */
  heldDeadlineDay?: string | null;
}

/** The foreground-service tier serves ONE user at a time (one notification,
 *  one location stream), and its task carries no region identifier the way a
 *  geofence event does — so the user it samples for is remembered under this
 *  reserved key, which no org user reference can collide with. */
const SERVICE_USER_KEY = '__service_user__';

/** The user the OS fence is armed for, so a periodic check-in (whose task,
 *  like the service's, carries no region identifier) knows whose stay to
 *  record. Same reserved-key rule as the service user. */
const FENCE_USER_KEY = '__fence_user__';

function readAll(): Record<string, BgRecord> {
  return readJsonFile(FILE_NAME) as Record<string, BgRecord>;
}

function write(userId: string, patch: Partial<BgRecord>): void {
  const all = readAll();
  all[userId] = { ...all[userId], ...patch };
  writeJsonFile(FILE_NAME, all as Record<string, unknown>);
}

/** Open a fresh stay at `at`, or close the open one (null). */
export function saveEnterAt(userId: string, at: number | null): void {
  write(userId, { enterAt: at, stayStart: at });
}

export interface StoredStay {
  enterAt: number | null;
  stayStart: number | null;
}

/** The open stay as the check-in rule needs it (checkpointStay). */
export function loadStay(userId: string): StoredStay {
  const record = readAll()[userId];
  const enterAt = typeof record?.enterAt === 'number' ? record.enterAt : null;
  const stayStart = typeof record?.stayStart === 'number' ? record.stayStart : null;
  return { enterAt, stayStart: enterAt == null ? null : stayStart };
}

export function saveStay(userId: string, stay: StoredStay): void {
  write(userId, { enterAt: stay.enterAt, stayStart: stay.enterAt == null ? null : stay.stayStart });
}

export function loadEnterAt(userId: string): number | null {
  const at = readAll()[userId]?.enterAt;
  return typeof at === 'number' ? at : null;
}

export function pendingObservations(userId: string): WireObservation[] {
  const pending = readAll()[userId]?.pending;
  return Array.isArray(pending) ? pending : [];
}

export function replacePending(userId: string, next: WireObservation[]): void {
  write(userId, { pending: next });
}

/** Append fresh aggregates through the caller's merge (same-day spans fold). */
export function queueObservations(
  userId: string,
  fresh: WireObservation[],
  merge: (existing: WireObservation[], fresh: WireObservation[]) => WireObservation[],
): void {
  const before: QueuedObservation[] = pendingObservations(userId);
  const at = Date.now() + (readAll()[userId]?.clockOffset ?? 0);
  // A new or changed day is stamped, so its seal (device.ts) says when.
  write(userId, { pending: stampChanged(before, merge(before, fresh), at) });
}

export function saveClockOffset(userId: string, offset: number): void {
  write(userId, { clockOffset: offset });
}

/** Null clears it: every sent day may leave the queue again. */
export function saveHeldDeadline(userId: string, day: string | null): void {
  write(userId, { heldDeadlineDay: day });
}

export function loadHeldDeadline(userId: string): string | null {
  const day = readAll()[userId]?.heldDeadlineDay;
  return typeof day === 'string' ? day : null;
}

export function saveReporterConfig(userId: string, config: { apiKey: string; devUrl?: string }): void {
  write(userId, { config });
}

export function loadReporterConfig(userId: string): { apiKey: string; devUrl?: string } | null {
  const cfg = readAll()[userId]?.config;
  return cfg && typeof cfg.apiKey === 'string' ? cfg : null;
}

/** Not a secret: whether the background flush needs a user token for this user. */
export function saveUserTokensInUse(userId: string, inUse: boolean): void {
  if (!inUse && readAll()[userId] === undefined) return;
  write(userId, { userTokens: inUse });
}

export function userTokensInUse(userId: string): boolean {
  return readAll()[userId]?.userTokens === true;
}

export function saveServiceUser(userId: string | null): void {
  const all = readAll();
  if (userId == null) delete all[SERVICE_USER_KEY];
  else all[SERVICE_USER_KEY] = { serviceUser: userId };
  writeJsonFile(FILE_NAME, all as Record<string, unknown>);
}

export function loadServiceUser(): string | null {
  const id = readAll()[SERVICE_USER_KEY]?.serviceUser;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function saveFenceUser(userId: string | null): void {
  const all = readAll();
  if (userId == null) delete all[FENCE_USER_KEY];
  else all[FENCE_USER_KEY] = { serviceUser: userId };
  writeJsonFile(FILE_NAME, all as Record<string, unknown>);
}

export function loadFenceUser(): string | null {
  const id = readAll()[FENCE_USER_KEY]?.serviceUser;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
