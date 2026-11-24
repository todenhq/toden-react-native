// ---------------------------------------------------------------------------
// The presence device (user token design rev 4, sections 6b and 14).
//
// Right after an address verification answers 202 with its HMAC
// presenceToken, the phone makes a P-256 key the OS never exports (the
// MyazaDeviceIntel Nitro module: Secure Enclave, Android Keystore) and
// registers its public half, with a presence user token from the host's
// provider. From then on the headless flush signs for its own 1-hour token
// (refreshIfDue) and seals each posted day (sealFor), so a late report still
// counts for its own day.
//
// The record (key alias, public key, device id, clock and refresh marks) is
// kept with expo-secure-store, this device only. Without that module, the
// Nitro module, or a provider, nothing here runs and presence works as in
// 4.4.0. The rules are device-rules.ts, pinned by the shared vectors.
// Mirrors the Flutter SDK's PresenceDeviceClient (Kotlin and Swift).
// ---------------------------------------------------------------------------

import { resolveBaseUrl } from '../services/resolveUrl';
import { saveClockOffset } from './background-store';
import { deviceIntelNative } from '../services/device-intel/native';
import {
  BACK_OFF_MS,
  clockOffsetFrom,
  errorCode,
  nextSignedAt,
  refreshDue,
  refreshOutcome,
  refreshText,
  registrationOutcome,
  registrationText,
  sealText,
} from './device-rules';
import type { WireObservation } from './post';
import { reportDevice } from './report-proof';
import { deviceOnly as options, secureStore, serially } from './secure-store';
import { keepPresenceUserToken } from './secure-token';
import { sha256 } from './sha256';
import { checkUserToken, userTokenFor, userTokenHeaders, userTokenProvider, type UserTokenProvider } from './user-token';

const KEY = 'toden.presence.device';

export interface DeviceRecord {
  externalUserId: string;
  alias?: string;
  publicKey?: string;
  keyStorage?: string;
  deviceId?: string;
  /** SHA-256 (hex) of the HMAC presenceToken a registration was refused or capped for. */
  refusedFor?: string;
  /**
   * SHA-256 (hex) of the HMAC presenceToken this device registered with. Core
   * binds a device to that token's verification, so a new verification's
   * token needs a new key and a new registration.
   */
  registeredFor?: string;
  lastSignedAt?: number;
  lastRefreshAt?: number;
  backOffUntil?: number;
  /** Server minus device, from the last core Date header. */
  clockOffset?: number;
  /** After 409 `presence_device_limit`: no new attempt before this. */
  limitUntil?: number;
}

const hasKey = (r: DeviceRecord): boolean => Boolean(r.alias && r.publicKey);
const isRegistered = (r: DeviceRecord): boolean => hasKey(r) && Boolean(r.deviceId);

/** PURE. Lowercase hex SHA-256 of a presenceToken: the refusal mark, never the token. */
export function tokenDigest(token: string): string {
  return Array.from(sha256(new TextEncoder().encode(token)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export type RegistrationStep =
  | { kind: 'registered' }
  | { kind: 'refused' }
  | { kind: 'reuse'; record: DeviceRecord }
  | { kind: 'new_key'; discard: string | null };

/** PURE. What a registration does with what this phone already holds. */
export function registrationStep(
  record: DeviceRecord | null,
  externalUserId: string,
  presenceToken: string,
): RegistrationStep {
  if (!record) return { kind: 'new_key', discard: null };
  if (record.externalUserId !== externalUserId) return { kind: 'new_key', discard: record.alias ?? null };
  if (isRegistered(record)) {
    return record.registeredFor === tokenDigest(presenceToken)
      ? { kind: 'registered' }
      : { kind: 'new_key', discard: record.alias ?? null };
  }
  if (record.refusedFor === tokenDigest(presenceToken)) return { kind: 'refused' };
  if (hasKey(record)) return { kind: 'reuse', record };
  return { kind: 'new_key', discard: null };
}

// ── Storage ────────────────────────────────────────────────────────────────

export async function readDevice(): Promise<DeviceRecord | null> {
  const store = secureStore();
  if (!store) return null;
  try {
    const raw = await serially(() => store.getItemAsync(KEY, options(store)));
    const v = raw ? (JSON.parse(raw) as DeviceRecord) : null;
    return v && typeof v.externalUserId === 'string' ? v : null;
  } catch {
    return null;
  }
}

async function saveDevice(record: DeviceRecord): Promise<void> {
  const store = secureStore();
  if (!store) return;
  await serially(() => store.setItemAsync(KEY, JSON.stringify(record), options(store))).catch(() => undefined);
}

async function deleteDevice(): Promise<void> {
  const store = secureStore();
  if (!store) return;
  await serially(() => store.deleteItemAsync(KEY, options(store))).catch(() => undefined);
}

function deleteKey(alias: string | undefined): void {
  if (!alias) return;
  try {
    deviceIntelNative()?.presenceKeyDelete(alias);
  } catch {
    // Nothing to delete.
  }
}

function sign(alias: string, text: string): string | null {
  try {
    const signature = deviceIntelNative()?.presenceKeySign(alias, text);
    return signature ? signature : null;
  } catch {
    return null;
  }
}

/** Logout: the key, its registration and its marks, for this user only. Never throws. */
export async function forgetPresenceDevice(externalUserId: string): Promise<void> {
  const record = await readDevice();
  if (!record || record.externalUserId !== externalUserId) return;
  deleteKey(record.alias);
  await deleteDevice();
}

// ── Requests ───────────────────────────────────────────────────────────────

interface Answer {
  status: number | null;
  date: string | null;
  body: unknown;
}

async function postJson(url: string, apiKey: string, body: unknown, headers: Record<string, string> = {}): Promise<Answer> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...headers },
      body: JSON.stringify(body),
    });
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status, date: response.headers?.get?.('date') ?? null, body: json };
  } catch {
    return { status: null, date: null, body: null };
  }
}

function withClock(record: DeviceRecord, answer: Answer, deviceNow: number): DeviceRecord {
  const offset = clockOffsetFrom(answer.date, deviceNow);
  if (offset == null) return record;
  // The queue stamps each changed day on this clock too (background-store.ts).
  saveClockOffset(record.externalUserId, offset);
  return { ...record, clockOffset: offset };
}

export type RegistrationResult =
  | 'registered'
  | 'refused'
  | 'limit'
  | 'delete_key'
  | 'keep'
  | 'no_key'
  | 'no_provider'
  | 'no_token'
  | 'user_token_invalid'
  | 'unavailable';

export interface RegisterInput {
  apiKey: string;
  devUrl?: string;
  externalUserId: string;
  /** The 202's HMAC presenceToken. Without it the SDK does not register. */
  presenceToken: string;
  getUserToken?: UserTokenProvider;
  now?: () => number;
}

async function sendRegistration(
  input: RegisterInput,
  start: DeviceRecord,
  userToken: string,
): Promise<RegistrationResult> {
  const now = input.now ?? Date.now;
  const base = resolveBaseUrl(input.apiKey, input.devUrl);
  let record = start;
  const alias = record.alias as string;
  const publicKey = record.publicKey as string;
  for (let attempt = 0; attempt < 2; attempt++) {
    const deviceNow = now();
    const signedAt = nextSignedAt(deviceNow + (record.clockOffset ?? 0), record.lastSignedAt ?? null);
    const proof = sign(alias, registrationText(input.externalUserId, publicKey, signedAt));
    if (!proof) return 'keep';
    record = { ...record, lastSignedAt: signedAt };
    await saveDevice(record);
    const device = await reportDevice().catch(() => undefined);
    const answer = await postJson(
      `${base}/api/v1/address/presence/devices`,
      input.apiKey,
      {
        externalUserId: input.externalUserId,
        publicKey,
        platform: platformName(),
        keyStorage: record.keyStorage || 'tee',
        signedAt,
        proof,
        presenceToken: input.presenceToken,
        ...(device ? { device } : {}),
      },
      userTokenHeaders(userToken),
    );
    // Logout, or another run's delete, while the request was out: leave it gone.
    if (!(await stillHeld(record))) return 'keep';
    record = withClock(record, answer, deviceNow);
    const code = errorCode(answer.body);
    switch (registrationOutcome(answer.status, code)) {
      case 'registered': {
        const id = (answer.body as { id?: unknown } | null)?.id;
        if (typeof id !== 'string' || !id) {
          await saveDevice(record);
          return 'keep';
        }
        await saveDevice({ ...record, deviceId: id, refusedFor: undefined, registeredFor: tokenDigest(input.presenceToken) });
        return 'registered';
      }
      case 'refused':
        // No refresh: this phone runs as before. A new verification's token may try again.
        deleteKey(alias);
        await saveDevice({
          externalUserId: input.externalUserId,
          refusedFor: tokenDigest(input.presenceToken),
          clockOffset: record.clockOffset,
        });
        return 'refused';
      case 'limit':
        // The cap frees up when the customer revokes a device or a check
        // ends: a later foreground tries again, after a back-off.
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[toden] presence_device_limit: this user already has the most presence devices');
        }
        deleteKey(alias);
        await saveDevice({
          externalUserId: input.externalUserId,
          clockOffset: record.clockOffset,
          limitUntil: now() + BACK_OFF_MS,
        });
        return 'limit';
      case 'delete_key':
        deleteKey(alias);
        await deleteDevice();
        return 'delete_key';
      case 'retry_clock':
        await saveDevice(record);
        continue;
      case 'keep':
        await saveDevice(record);
        return code === 'user_token_invalid' ? 'user_token_invalid' : 'keep';
    }
  }
  return 'keep';
}

function platformName(): 'ios' | 'android' {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    return Platform.OS === 'ios' ? 'ios' : 'android';
  } catch {
    return 'android';
  }
}

const inflight = new Map<string, Promise<RegistrationResult>>();

/**
 * Registers this phone's presence device for the user, if it has none. Never
 * throws. With no provider, no native key or no secure storage, nothing is
 * sent. A phone already registered (or refused for this verification)
 * answers at once, and the host's backend mints nothing. The 202 and a later
 * enable can ask moments apart: one registration runs per user at a time, and
 * a second caller gets the first one's answer.
 */
export function registerPresenceDevice(input: RegisterInput): Promise<RegistrationResult> {
  const running = inflight.get(input.externalUserId);
  if (running) return running;
  const run = register(input).finally(() => inflight.delete(input.externalUserId));
  inflight.set(input.externalUserId, run);
  return run;
}

async function register(input: RegisterInput): Promise<RegistrationResult> {
  try {
    if (!(input.getUserToken ?? userTokenProvider())) return 'no_provider';
    const native = deviceIntelNative();
    if (!native || !secureStore()) return 'unavailable';
    const now = input.now ?? Date.now;
    const held = await readDevice();
    if (
      held &&
      held.externalUserId === input.externalUserId &&
      !isRegistered(held) &&
      held.limitUntil != null &&
      now() < held.limitUntil
    ) {
      return 'limit';
    }
    const step = registrationStep(held, input.externalUserId, input.presenceToken);
    if (step.kind === 'registered') return 'registered';
    if (step.kind === 'refused') return 'refused';
    let record: DeviceRecord;
    if (step.kind === 'reuse') {
      record = step.record;
    } else {
      // The key first: a phone with none answers no_key before the host mints.
      deleteKey(step.discard ?? undefined);
      await deleteDevice();
      const alias = `co.toden.presence.device.${randomId()}`;
      const publicKey = native.presenceKeyCreate(alias);
      if (!publicKey) return 'no_key';
      record = {
        externalUserId: input.externalUserId,
        alias,
        publicKey,
        keyStorage: native.presenceKeyStorage(alias) || undefined,
      };
      // Kept before sending, so an answer that never comes reuses this key.
      await saveDevice(record);
    }
    let outcome: RegistrationResult = 'user_token_invalid';
    // A token that registered another device, or was refreshed, is refused
    // with user_token_invalid: one fresh token and one more try.
    for (let attempt = 0; attempt < 2 && outcome === 'user_token_invalid'; attempt++) {
      const got = await userTokenFor(
        { apiKey: input.apiKey, externalUserId: input.externalUserId, purpose: 'presence', getUserToken: input.getUserToken },
        { force: true },
      );
      if (!got.token) return 'no_token';
      outcome = await sendRegistration(input, record, got.token);
      if (outcome === 'user_token_invalid') record = (await readDevice()) ?? record;
    }
    return outcome;
  } catch {
    return 'unavailable';
  }
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Whether the stored record is still the one a request was sent for: the same
 * user, key and registration. A logout, or another run's delete or new key,
 * while the request was out means its answer must not write the old record
 * back (or keep a token for a user who signed out).
 */
async function stillHeld(sent: DeviceRecord): Promise<boolean> {
  const current = await readDevice();
  return (
    current != null &&
    current.externalUserId === sent.externalUserId &&
    current.alias === sent.alias &&
    current.deviceId === sent.deviceId
  );
}

const refreshing = new Map<string, Promise<boolean>>();

/**
 * A fresh presence token for the flush when this phone holds a registered
 * device for the user and a refresh is due. True when one was stored.
 * Never throws. The geofence task, a check-in and the foreground service can
 * flush at once: one refresh runs per user at a time, and a second caller
 * gets the first one's answer.
 */
export function refreshIfDue(
  externalUserId: string,
  cfg: { apiKey: string; devUrl?: string },
  now: () => number = Date.now,
): Promise<boolean> {
  const running = refreshing.get(externalUserId);
  if (running) return running;
  const run = refresh(externalUserId, cfg, now).finally(() => refreshing.delete(externalUserId));
  refreshing.set(externalUserId, run);
  return run;
}

async function refresh(
  externalUserId: string,
  cfg: { apiKey: string; devUrl?: string },
  now: () => number,
): Promise<boolean> {
  try {
    const start = await readDevice();
    if (!start || !isRegistered(start) || start.externalUserId !== externalUserId) return false;
    if (!refreshDue(now(), start.lastRefreshAt ?? null, start.backOffUntil ?? null)) return false;
    if (!deviceIntelNative()) return false;
    const base = resolveBaseUrl(cfg.apiKey, cfg.devUrl);
    let record = start;
    const deviceId = record.deviceId as string;
    for (let attempt = 0; attempt < 2; attempt++) {
      const deviceNow = now();
      const signedAt = nextSignedAt(deviceNow + (record.clockOffset ?? 0), record.lastSignedAt ?? null);
      const signature = sign(record.alias as string, refreshText(deviceId, externalUserId, signedAt));
      if (!signature) return false;
      // Kept before sending: a signedAt once sent is never sent again.
      record = { ...record, lastSignedAt: signedAt };
      await saveDevice(record);
      const answer = await postJson(`${base}/api/v1/address/presence/devices/token`, cfg.apiKey, {
        deviceId,
        externalUserId,
        signedAt,
        signature,
      });
      if (!(await stillHeld(record))) return false;
      record = withClock(record, answer, deviceNow);
      if (answer.status != null) record = { ...record, lastRefreshAt: deviceNow };
      switch (refreshOutcome(answer.status, errorCode(answer.body))) {
        case 'store': {
          await saveDevice({ ...record, backOffUntil: undefined });
          // The same identity check a provider's answer gets.
          const checked = checkUserToken(answer.body, { externalUserId, purpose: 'presence', apiKey: cfg.apiKey }, now());
          if (!checked) return false;
          await keepPresenceUserToken(checked);
          return true;
        }
        case 'delete_key':
          deleteKey(record.alias);
          await deleteDevice();
          return false;
        case 'retry_clock':
        case 'retry_signed_at':
          await saveDevice(record);
          continue;
        case 'back_off':
          await saveDevice({ ...record, backOffUntil: deviceNow + BACK_OFF_MS });
          return false;
        case 'keep':
          await saveDevice(record);
          return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * The flush's sealer for this user, or null when there is no registered
 * device. It seals each posted row that has its `observedAtMillis`, over the
 * row exactly as posted; a row the key cannot sign goes unsealed, never
 * dropped (core judges it as an unsealed report).
 */
export async function sealerFor(
  externalUserId: string,
): Promise<((wire: WireObservation[], observedAt: Array<number | undefined>) => SealedBatch | null) | null> {
  const record = await readDevice();
  if (!record || !isRegistered(record) || record.externalUserId !== externalUserId) return null;
  const alias = record.alias as string;
  const deviceId = record.deviceId as string;
  return (wire, observedAt) => sealBatch(wire, observedAt, deviceId, externalUserId, (text) => sign(alias, text));
}

export interface SealedBatch {
  sealDeviceId: string;
  observations: Array<WireObservation & { seal?: { observedAt: string; signature: string } }>;
}

/** PURE apart from `signText`. Null when nothing was sealed. */
export function sealBatch(
  wire: WireObservation[],
  observedAt: Array<number | undefined>,
  deviceId: string,
  externalUserId: string,
  signText: (text: string) => string | null,
): SealedBatch | null {
  let any = false;
  const observations = wire.map((o, i) => {
    const at = observedAt[i];
    if (typeof at !== 'number' || at <= 0) return o;
    const signature = signText(sealText(deviceId, externalUserId, o, at));
    if (!signature) return o;
    any = true;
    return { ...o, seal: { observedAt: new Date(at).toISOString(), signature } };
  });
  return any ? { sealDeviceId: deviceId, observations } : null;
}
