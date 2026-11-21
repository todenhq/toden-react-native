// ---------------------------------------------------------------------------
// The Toden voice's clips, fetched when the flow starts.
//
// The SDK resolves its workflow (and so its voice) when it mounts and again
// when it opens (components/useWorkflowMount.ts). Starting the download there,
// rather than when the liveness step opens, gives it the document steps'
// minutes instead of the liveness primer's seconds: a person heard the device
// voice say the first prompts and the Toden voice the rest (2026-11-20). The
// liveness step joins this download (voiceClips.ts preloadVoiceClips).
// Background and best-effort: nothing waits on it.
// ---------------------------------------------------------------------------

import { resolveVoiceGuidance } from '../config/voiceGuidance';
import { voiceClipServer } from '../services/resolveUrl';
import type { VoiceGuidanceOption } from '../types/config';
import { preloadVoiceClips } from './voiceClips';
import { voiceApplicant } from './voiceApplicant';

/**
 * Starts fetching the flow's Toden voice; nothing with guidance off, the
 * device's voice chosen, or no server. The country is the one the app passed,
 * if any: the liveness step loads again for the country picked in the flow.
 */
export function preloadFlowVoice(config: {
  apiKey: string;
  devUrl?: string;
  voiceGuidance?: VoiceGuidanceOption;
  country?: string;
  userId?: string;
}): void {
  try {
    const guidance = resolveVoiceGuidance(config.voiceGuidance);
    if (!guidance.enabled || guidance.deviceVoice) return;
    const server = voiceClipServer(config.apiKey, config.devUrl);
    if (!server) return;
    preloadVoiceClips(
      {
        server,
        voice: guidance.voice,
        language: guidance.language,
        applicant: voiceApplicant(guidance, { country: config.country, userId: config.userId }),
      },
      { fresh: true },
    );
  } catch {
    /* the liveness step loads the clips itself */
  }
}
