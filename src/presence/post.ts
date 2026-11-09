// ---------------------------------------------------------------------------
// The one wire path for presence observations — shared by the foreground
// reporter and the background geofence flush, so the two tiers can never
// drift on the request shape. Best-effort by contract: a failure returns
// false and the caller keeps its queue.
// ---------------------------------------------------------------------------

import { resolveBaseUrl } from '../services/resolveUrl';
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

export async function postObservations(
  apiKey: string,
  devUrl: string | undefined,
  externalUserId: string,
  observations: WireObservation[],
): Promise<boolean> {
  if (observations.length === 0) return true;
  try {
    const base = resolveBaseUrl(apiKey, devUrl);
    const device = await reportDevice();
    const wire = observations.map(emulatorFlag);
    // Best-effort: a report without proof still goes out, and a proven report
    // later the same day replaces it on the server.
    const attestation = await attestReport({ base, apiKey, externalUserId, device, observations: wire });
    const presenceToken = presenceTokenFor(externalUserId);
    const response = await fetch(`${base}/api/v1/address/observations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        externalUserId,
        ...(presenceToken ? { presenceToken } : {}),
        observations: wire,
        ...(device ? { device } : {}),
        ...(attestation ? { attestation } : {}),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
