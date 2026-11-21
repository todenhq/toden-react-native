// Who the spoken prompts are for, as the voice choice needs it (pickVoice in
// voicePhrases.ts): how to match, the country of the document being verified,
// and a seed that names the person for the whole session. Pure.

import type { ResolvedVoiceGuidance } from '../config/voiceGuidance';
import { SESSION_VOICE_SEED, type VoiceApplicant } from './voicePhrases';

export function voiceApplicant(
  guidance: Pick<ResolvedVoiceGuidance, 'localVoice' | 'localVoiceNeighbours'>,
  person: { country?: string | null; userId?: string | null },
): VoiceApplicant {
  return {
    choice: guidance.localVoice,
    // With matching off the country changes nothing, so it is left out: the
    // flow's early download and the liveness step's are then the same one.
    country: guidance.localVoice === 'off' ? undefined : person.country?.trim().toUpperCase() || undefined,
    seed: person.userId?.trim() || SESSION_VOICE_SEED,
    neighbours: guidance.localVoiceNeighbours,
  };
}
