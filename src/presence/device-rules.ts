// ---------------------------------------------------------------------------
// The presence device's rules, pure (user token design rev 4, sections 6b, 14).
//
// After an address verification answers 202, the phone makes a P-256 key the
// OS will never export (Secure Enclave, Android Keystore) and registers its
// public half with Toden. From then on background code gets its own 1-hour
// presence token by signing a timestamped request, and every queued day is
// sealed with that key, so a late report still counts for its own day.
//
// Everything here is a decision or a text to sign, so the shared vectors
// (sdk-flutter/test/presence_seal_vectors.json) pin it in all four languages:
// this file, presence_device.dart, PresenceDevice.swift and PresenceDevice.kt.
// ---------------------------------------------------------------------------

import type { WireObservation } from './post';
import { reportDigestRow } from './report-proof';

/** At most one refresh per device in this long. */
export const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
/** After 409 `no_live_watch` (a pending device or a dormant chain). */
export const BACK_OFF_MS = 6 * 60 * 60 * 1000;

/** The DER prefix that turns a 65-byte X9.63 P-256 point into an SPKI. */
export const P256_SPKI_PREFIX_HEX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

export function registrationText(externalUserId: string, publicKey: string, signedAt: number): string {
  return `toden-presence-device-v1\n${externalUserId}\n${publicKey}\n${signedAt}`;
}

export function refreshText(deviceId: string, externalUserId: string, signedAt: number): string {
  return `toden-presence-refresh-v1\n${deviceId}\n${externalUserId}\n${signedAt}`;
}

/** The seal signs the observation's report-digest row, exactly as it is posted. */
export function sealText(
  deviceId: string,
  externalUserId: string,
  observation: WireObservation,
  observedAtMillis: number,
): string {
  return `toden-presence-seal-v1\n${deviceId}\n${externalUserId}\n${reportDigestRow(observation)}\n${observedAtMillis}`;
}

/**
 * The next `signedAt`: the corrected clock, but always after the last one
 * sent, because the server takes only a strictly increasing value per device.
 */
export function nextSignedAt(correctedNow: number, lastSent: number | null | undefined): number {
  return lastSent == null ? correctedNow : Math.max(correctedNow, lastSent + 1);
}

/** Server minus device, from a response's Date header; null keeps the offset. */
export function clockOffsetFrom(date: string | null | undefined, deviceNowMillis: number): number | null {
  if (!date) return null;
  const server = Date.parse(date);
  return Number.isNaN(server) ? null : server - deviceNowMillis;
}

export type RefreshOutcome = 'store' | 'delete_key' | 'retry_clock' | 'retry_signed_at' | 'back_off' | 'keep';

/** What a refresh answer means. The code decides; only 403 `presence_device_invalid` ends the key. */
export function refreshOutcome(status: number | null, code: string | null): RefreshOutcome {
  if (status === 201 || status === 200) return 'store';
  if (status === 403 && code === 'presence_device_invalid') return 'delete_key';
  if (status === 400 && code === 'clock_skew') return 'retry_clock';
  if (status === 409 && code === 'stale_signed_at') return 'retry_signed_at';
  if (status === 409 && code === 'no_live_watch') return 'back_off';
  return 'keep';
}

export type RegistrationOutcome = 'registered' | 'refused' | 'limit' | 'delete_key' | 'retry_clock' | 'keep';

export function registrationOutcome(status: number | null, code: string | null): RegistrationOutcome {
  if (status === 201 || status === 200) return 'registered';
  if (status === 403 && code === 'device_registration_refused') return 'refused';
  if (status === 422 && code === 'device_not_genuine') return 'refused';
  if (status === 409 && code === 'presence_device_limit') return 'limit';
  if (status === 403 && code === 'presence_device_invalid') return 'delete_key';
  if (status === 422 && code === 'invalid_device_key') return 'delete_key';
  if (status === 400 && code === 'clock_skew') return 'retry_clock';
  return 'keep';
}

/** Whether background code may ask for a new token now. */
export function refreshDue(nowMillis: number, lastRefreshAt: number | null, backOffUntil: number | null): boolean {
  if (backOffUntil != null && nowMillis < backOffUntil) return false;
  return lastRefreshAt == null || nowMillis - lastRefreshAt >= REFRESH_INTERVAL_MS;
}

/**
 * The days a 2xx may take off the queue. A watch still in progress past its
 * deadline (held for late sealed reports) cannot count the days after the
 * deadline yet, but a reviewer's extension may let it, so those stay queued
 * until the watch resolves or the deadline moves past them.
 */
export function removableAfterSend<T extends { day: string }>(sent: readonly T[], heldDeadlineDay: string | null): T[] {
  return heldDeadlineDay == null ? [...sent] : sent.filter((o) => o.day <= heldDeadlineDay);
}

/** The error code of a JSON error answer (v1 envelope or flat). */
export function errorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const error = b['error'];
  const code =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)['code']
      : typeof error === 'string'
        ? error
        : b['code'];
  return typeof code === 'string' ? code : null;
}

/** A queued day, with when its aggregate last changed (corrected clock). Never posted as is. */
export type QueuedObservation = WireObservation & { observedAtMillis?: number };

/**
 * Stamps `observedAtMillis` on every entry of `merged` that is new or changed
 * against `before`, so a changed day is sealed again, as of `at`.
 */
export function stampChanged<T extends QueuedObservation>(before: readonly T[], merged: T[], at: number): T[] {
  const prior = new Map(before.map((o) => [o.day, rowKey(o)]));
  return merged.map((o) => (prior.get(o.day) === rowKey(o) ? o : { ...o, observedAtMillis: at }));
}

function rowKey(o: QueuedObservation): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { observedAtMillis, ...row } = o;
  return JSON.stringify(row);
}

/** The queued entry as the server receives it: no local fields. */
export function wireOf(o: QueuedObservation): WireObservation {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { observedAtMillis, ...row } = o;
  return row;
}
