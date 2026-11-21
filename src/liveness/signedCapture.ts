// ---------------------------------------------------------------------------
// Signed capture: the platform's proof (App Attest on iPhone, Play Integrity
// on Android) that the selfie, liveness video and (on an iPhone with Face ID)
// depth frame Core received are the exact files this app uploaded, from the
// genuine app on a genuine device.
//
// The upload hook hashes each file it sends (the very file the request body
// carries, after compression) and the store keeps the hash beside the media id
// the server answered with. At submit the hashes are written into the digest
// text below and the platform signs SHA-256(challenge || SHA-256(digest)), the
// binding presence reports already use. Core hashes each upload as it arrives
// and checks the two agree before it checks the signature
// (kyc-core lib/liveness-capture/signed-capture.ts).
//
// `captureDigestText` is the wire contract, mirrored by kyc-core and the
// Flutter SDK. All share one test vector: change every copy in the same
// commit, or no capture verifies.
//
// Best-effort end to end: a file that cannot be hashed, a simulator, a missing
// Play Integrity project, the web, or any error leaves the proof off, and the
// submission goes ahead without it.
// ---------------------------------------------------------------------------

import { toHex } from '../emrtd/bytes';
import { nativeModulePresent } from '../lib/native-module-present';
import { boundChallenge } from '../presence/report-proof';
import { sha256 } from '../presence/sha256';
import { collectAttestation, type ChallengeApi, type DeviceAttestation } from '../services/device-intel/attestation';

/** The files a signed capture covers, in the digest's order. */
const SIGNED_SLOTS = ['selfie', 'livenessVideo', 'livenessDepth'] as const;
type SignedSlot = (typeof SIGNED_SLOTS)[number];

/** Each covered file's SHA-256, lowercase hex. A file not sent is absent. */
export type CaptureMedia = Partial<Record<SignedSlot, string>>;

/** What rides `integrity.captureProof` on the submission. */
export interface CaptureProof {
  media: CaptureMedia;
  attestation: DeviceAttestation;
}

/**
 * The whole proof's bound, challenge round trip included. It runs at submit
 * after the fingerprint's own attestation, so it is kept a little under that
 * one's 5 seconds: a slow platform costs the proof, never the applicant's wait.
 */
export const CAPTURE_PROOF_TIMEOUT_MS = 4000;

/**
 * The text the platform's proof covers: one line per file, empty for a
 * selfie or video not sent. The depth frame (liveness/depthFrame.ts, added
 * 2026-11-19) has a line only when one was sent, so a proof without one reads
 * exactly as it did before, and Core checks either.
 */
export function captureDigestText(media: CaptureMedia): string {
  const lines = ['toden-capture-v1', `selfie:${media.selfie ?? ''}`, `livenessVideo:${media.livenessVideo ?? ''}`];
  if (media.livenessDepth) lines.push(`livenessDepth:${media.livenessDepth}`);
  return lines.join('\n');
}

/**
 * The hashes of the files a submission names, looked up by media id, so a
 * hash can only ever describe the upload the request points at (a retake
 * replaces the id, and its old hash simply stops matching). Null when none is
 * known: there is nothing to sign.
 */
export function captureMediaOf(
  mediaIds: Partial<Record<SignedSlot, string | undefined>>,
  uploadSha256: Readonly<Record<string, string>>,
): CaptureMedia | null {
  const media: CaptureMedia = {};
  for (const slot of SIGNED_SLOTS) {
    const id = mediaIds[slot];
    const hash = id ? uploadSha256[id] : undefined;
    if (hash) media[slot] = hash;
  }
  return Object.keys(media).length > 0 ? media : null;
}

interface FileReader {
  read(uri: string): Promise<Uint8Array<ArrayBuffer>>;
  digest(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array>;
}

// expo-file-system and expo-crypto load lazily, behind the native-module check
// (lib/native-module-present.ts): an app built without either keeps working,
// and the plain TypeScript digest stands in for a missing expo-crypto.
function expoReader(): FileReader | null {
  if (!nativeModulePresent('FileSystem')) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File } = require('expo-file-system') as typeof import('expo-file-system');
  const crypto = nativeModulePresent('ExpoCrypto')
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-crypto') as typeof import('expo-crypto'))
    : null;
  return {
    read: (uri) => new File(uri).bytes(),
    digest: async (bytes) =>
      crypto
        ? new Uint8Array(await crypto.digest(crypto.CryptoDigestAlgorithm.SHA256, bytes))
        : sha256(bytes),
  };
}

/**
 * SHA-256 (lowercase hex) of the file at `uri`, read whole: the liveness clip
 * is a few MB after compression. Undefined when it cannot be read; never throws.
 * `reader` is a test seam.
 */
export async function fileSha256(uri: string, reader: () => FileReader | null = expoReader): Promise<string | undefined> {
  try {
    const r = reader();
    if (!r) return undefined;
    return toHex(await r.digest(await r.read(uri)));
  } catch {
    return undefined;
  }
}

/**
 * The platform's proof over `media`, or undefined. Never throws; never exceeds
 * the bound. Spends a single-use device challenge, so call it once per
 * submission.
 */
export async function makeCaptureProof(input: {
  media: CaptureMedia;
  api: ChallengeApi;
  platform: string;
  playIntegrityCloudProjectNumber?: string | null;
  timeoutMs?: number;
}): Promise<CaptureProof | undefined> {
  const digestText = captureDigestText(input.media);
  const attestation = await collectAttestation(
    {
      api: input.api,
      platform: input.platform,
      playIntegrityCloudProjectNumber: input.playIntegrityCloudProjectNumber ?? null,
      bindChallenge: (challenge) => boundChallenge(challenge, digestText),
    },
    input.timeoutMs ?? CAPTURE_PROOF_TIMEOUT_MS,
  ).catch(() => undefined);
  return attestation ? { media: input.media, attestation } : undefined;
}
