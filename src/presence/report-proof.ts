// ---------------------------------------------------------------------------
// Proving a presence report. The server only counts a report from the phone
// the check was started on (`device`), and from a phone that can attest it
// wants the platform's proof over these exact contents, so a report cannot be
// scripted or edited on the way out. Best-effort: anything that cannot be
// proved is left off and the report still goes.
//
// `reportDigestText` is the wire contract, mirrored by kyc-core
// (lib/address-intel/presence/report-proof.ts) and the Flutter SDK's Dart,
// Kotlin and Swift copies. All share one test vector: change it in every copy
// in the same commit, or no report ever verifies.
// ---------------------------------------------------------------------------

import { concat, fromBase64, toBase64 } from '../emrtd/bytes';
import { collectAttestation, type DeviceAttestation } from '../services/device-intel/attestation';
import { collectStableId } from '../services/device-intel/ids';
import { expoDevice, persistentDeviceId } from '../services/fingerprint-sources';
import type { DeviceChallengeResponse } from '../services/api-types';
import { OS } from '../utils/platform';
import type { WireObservation } from './post';
import { sha256 } from './sha256';
import { loadPresencePin } from './store';

export interface ReportDevice {
  deviceId?: string;
  stableId?: string;
}

export function reportDigestText(input: {
  externalUserId: string;
  device?: ReportDevice | null;
  observations: WireObservation[];
}): string {
  return [
    'toden-presence-report-v1',
    input.externalUserId,
    input.device?.stableId ?? '',
    input.device?.deviceId ?? '',
    ...input.observations.map((o) =>
      [
        o.day,
        o.source,
        o.dwellMinutes,
        o.nightPresent ? 1 : 0,
        o.samples,
        o.integrity?.mockLocation === true ? 1 : 0,
        o.integrity?.emulator === true ? 1 : 0,
      ].join('|'),
    ),
  ].join('\n');
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** SHA-256(challenge || digest), base64: what the platform is asked to sign. */
export function boundChallenge(challenge: string, digestText: string): string {
  return toBase64(sha256(concat(fromBase64(challenge), sha256(utf8(digestText)))));
}

/** Who is reporting: the same two ids the verification's fingerprint carried. */
export async function reportDevice(): Promise<ReportDevice | undefined> {
  const [deviceId, stableId] = [await persistentDeviceId().catch(() => undefined), collectStableId()];
  if (!deviceId && !stableId) return undefined;
  return { ...(deviceId ? { deviceId } : {}), ...(stableId ? { stableId } : {}) };
}

/** A simulator or emulator says so on every report; the OS is the source. */
export function emulatorFlag(o: WireObservation): WireObservation {
  if (expoDevice()?.isDevice !== false) return o;
  return { ...o, integrity: { ...o.integrity, emulator: true } };
}

export async function attestReport(input: {
  base: string;
  apiKey: string;
  externalUserId: string;
  device?: ReportDevice;
  observations: WireObservation[];
}): Promise<DeviceAttestation | undefined> {
  const digestText = reportDigestText(input);
  return collectAttestation({
    platform: OS,
    playIntegrityCloudProjectNumber: loadPresencePin(input.externalUserId)?.playIntegrityProject ?? null,
    bindChallenge: (challenge) => boundChallenge(challenge, digestText),
    api: {
      async deviceChallenge(body, signal): Promise<DeviceChallengeResponse> {
        const response = await fetch(`${input.base}/api/v1/device/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
          body: JSON.stringify(body),
          ...(signal ? { signal } : {}),
        });
        if (!response.ok) throw new Error('device challenge refused');
        return (await response.json()) as DeviceChallengeResponse;
      },
    },
  }).catch(() => undefined);
}
