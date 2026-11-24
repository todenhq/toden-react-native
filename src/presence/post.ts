// ---------------------------------------------------------------------------
// The one wire path for presence observations — shared by the foreground
// reporter and the background geofence flush, so the two tiers can never
// drift on the request shape. Best-effort by contract: a failure returns
// false and the caller keeps its queue.
// ---------------------------------------------------------------------------

import { resolveBaseUrl } from '../services/resolveUrl';
import { wireOf, type QueuedObservation } from './device-rules';
import { attestReport, emulatorFlag, reportDevice } from './report-proof';
import { presenceTokenFor } from './store';

export interface WireObservation {
  day: string;
  source: 'geofence' | 'foreground';
  dwellMinutes: number;
  nightPresent: boolean;
  samples: number;
  integrity?: { mockLocation?: boolean; emulator?: boolean };
}

/**
 * Seals the rows as posted (device.ts), given when each queued day last
 * changed. Null: nothing sealed, and the body is unchanged.
 */
export type ObservationSealer = (
  wire: WireObservation[],
  observedAt: Array<number | undefined>,
) => { sealDeviceId: string; observations: WireObservation[] } | null;

/**
 * Posts one batch. `headers` carries the user token when there is one
 * (user-token.ts); without it the request is exactly 4.4.0's. `seal` is
 * passed only beside a user token, since core reads seals only then. Null
 * when nothing came back.
 */
export async function sendObservations(
  apiKey: string,
  devUrl: string | undefined,
  externalUserId: string,
  observations: QueuedObservation[],
  headers: Record<string, string> = {},
  seal?: ObservationSealer | null,
): Promise<Response | null> {
  try {
    // Kept in device-only storage that cannot be read before the first
    // unlock: no post then, and the caller keeps its queue.
    const held = await presenceTokenFor(externalUserId);
    if (held.locked) return null;
    const presenceToken = held.token;
    const base = resolveBaseUrl(apiKey, devUrl);
    const device = await reportDevice();
    // Local fields (when a day last changed) never reach the wire.
    const wire = observations.map((o) => emulatorFlag(wireOf(o)));
    // Best-effort: a report without proof still goes out, and a proven report
    // later the same day replaces it on the server.
    const attestation = await attestReport({ base, apiKey, externalUserId, device, observations: wire });
    let sealed: ReturnType<ObservationSealer> = null;
    try {
      sealed = seal ? seal(wire, observations.map((o) => o.observedAtMillis)) : null;
    } catch {
      sealed = null;
    }
    return await fetch(`${base}/api/v1/address/observations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...headers,
      },
      body: JSON.stringify({
        externalUserId,
        ...(presenceToken ? { presenceToken } : {}),
        ...(sealed ? { sealDeviceId: sealed.sealDeviceId } : {}),
        observations: sealed ? sealed.observations : wire,
        ...(device ? { device } : {}),
        ...(attestation ? { attestation } : {}),
      }),
    });
  } catch {
    return null;
  }
}

export async function postObservations(
  apiKey: string,
  devUrl: string | undefined,
  externalUserId: string,
  observations: WireObservation[],
  headers: Record<string, string> = {},
): Promise<boolean> {
  if (observations.length === 0) return true;
  const response = await sendObservations(apiKey, devUrl, externalUserId, observations, headers);
  return response?.ok === true;
}
