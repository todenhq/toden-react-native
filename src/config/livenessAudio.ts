import { configScope, isFaceScope } from '../lib/scope';

// Whether the liveness recording carries sound. Off unless a workflow asked.
// Mirrored by the web (lib/liveness-audio.ts) and Flutter
// (config/liveness_audio.dart) SDKs: keep the three in lockstep.
export function recordsLivenessAudio(config: {
  livenessAudio?: boolean;
  scope?: string;
  subjectType?: string | null;
  enableSelfie?: boolean;
  enableLiveness?: boolean;
}): boolean {
  if (config.livenessAudio !== true) return false;
  // A scoped flow's own switches are its scope: only the two that capture a
  // face have a recording to put sound on.
  const scope = configScope(config);
  if (scope) return isFaceScope(scope);
  return config.subjectType !== 'business' && config.enableSelfie !== false && config.enableLiveness !== false;
}
