// ---------------------------------------------------------------------------
// Spoken liveness guidance — OUTPUT ONLY (no microphone). Mirrors the web
// SDK's liveness/speech.ts and the Flutter SDK's _TtsService.
//
// With a Toden voice set (`voiceGuidance.voice`) a prompt plays that voice's
// pre-recorded clip (voiceClips.ts); anything without a loaded clip is spoken
// by the device voice through expo-speech, exactly as before. Voice guidance
// exists for accessibility; it never records audio, so there is no microphone
// permission and no microphone error code.
// ---------------------------------------------------------------------------

import * as Speech from 'expo-speech';

import { resolveVoiceGuidance } from '../config/voiceGuidance';
import type { VoiceGuidanceOption } from '../types/config';
import { VoiceClips } from './voiceClips';

export { resolveVoiceGuidance, type ResolvedVoiceGuidance } from '../config/voiceGuidance';

/**
 * The device voice for `language`: an Enhanced one when the device has it,
 * else undefined (the engine's default for the language, as before). Only an
 * exact language match counts, so `en-US` never picks a British voice.
 */
export function pickDeviceVoice(voices: readonly Speech.Voice[], language: string): string | undefined {
  const wanted = language.replace(/_/g, '-').toLowerCase();
  const enhanced = voices.find(
    (v) => (v.quality as string) === 'Enhanced' && v.language.replace(/_/g, '-').toLowerCase() === wanted,
  );
  return enhanced?.identifier;
}

/**
 * The pause between one phrase ending and the next starting: a breath, as
 * between two things a person says to you. At a quarter of a second the
 * prompts came back to back ("Hold still" "Turn your head" "Good.") and read
 * as rushed, barked commands, though each clip alone is calm. The web SDK's
 * value (liveness/speech.ts).
 */
export const PAUSE_BETWEEN_PHRASES_MS = 700;

/**
 * How long a phrase waits for its Toden clip while the clips are still
 * landing, before the device voice says it instead. A person heard the device
 * voice say the first prompts and the Toden voice the rest (2026-11-20): the
 * clips were seconds from landing. Only a phrase that may yet have a clip
 * waits; once the download has settled nothing does.
 */
export const CLIP_GRACE_MS = 2_000;

/** PURE. Far longer than any prompt takes to say, at the device voice's slowest. */
export function longestPhraseMs(text: string): number {
  return 2_000 + text.length * 120;
}

/**
 * A tiny speaker that de-dupes consecutive identical phrases (so a guidance
 * string repeated every frame is only spoken once) and no-ops when disabled.
 * One instance per liveness session.
 *
 * Turn-taking, as on web and Flutter: a phrase is never cut off mid-word. One
 * that arrives while another is being said waits for it to finish, then a short
 * pause, and only the NEWEST waiting phrase is said (guidance that changed
 * twice meanwhile skips the stale one in between). Cutting the last phrase off
 * for every new one made the prompts run into each other ("Hold sti- Turn your
 * head"), which a person following them can mistake for one garbled
 * instruction.
 */
export class LivenessSpeaker {
  private readonly enabled: boolean;
  private readonly language: string;
  private readonly voice: string | undefined;
  private deviceVoice: string | undefined;
  private clips: VoiceClips | null = null;
  private recordsAudio: boolean | null = null;
  private lastSpoken: string | null = null;
  private spokeBefore = false;
  /** The phrase being said, clip or device voice, until its pause is over. */
  private speakingText: string | null = null;
  /** The latest phrase waiting for its turn. */
  private waitingText: string | null = null;
  /** Counts phrases, so a late end event from an earlier one is ignored. */
  private turn = 0;
  /** The pause after a phrase, or the watchdog that ends a phrase whose end never came. */
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly clipGraceMs: number;

  constructor(option: VoiceGuidanceOption | undefined, options: { clipGraceMs?: number } = {}) {
    this.clipGraceMs = options.clipGraceMs ?? CLIP_GRACE_MS;
    const resolved = resolveVoiceGuidance(option);
    this.enabled = resolved.enabled;
    this.language = resolved.language;
    this.voice = resolved.voice;
    if (this.enabled) {
      // Warm the engine NOW, not at the first phrase. Android's TextToSpeech
      // initialises asynchronously, and when the user is well-positioned from
      // the start the first thing this session ever says is the first GESTURE
      // COMMAND — which then races engine init and loses: exactly the phrase
      // a user holding the phone at arm's length cannot afford to miss. Any
      // expo-speech call triggers init; voices is the harmless one, and its
      // answer names the Enhanced voice to prefer. iOS initialises
      // synchronously and ignores the warm-up.
      void Speech.getAvailableVoicesAsync()
        .then((voices) => {
          this.deviceVoice = pickDeviceVoice(voices ?? [], this.language);
        })
        .catch(() => undefined);
    }
  }

  /**
   * Starts loading the Toden voice's clips from `server` (once), joining the
   * download the flow started when it resolved its voice (voicePreload.ts). A
   * no-op with guidance off, no voice chosen or no server. A phrase whose clip
   * is still on its way waits up to CLIP_GRACE_MS for it, then uses the device
   * voice.
   */
  prepareVoice(server: string | undefined): void {
    if (!this.enabled || !this.voice || !server || this.clips) return;
    this.clips = new VoiceClips();
    if (this.recordsAudio !== null) this.clips.setRecordsAudio(this.recordsAudio);
    void this.clips.load({ server, voice: this.voice, language: this.language });
  }

  /** Whether the liveness recording carries sound, so clips play beside the microphone. */
  setRecordsAudio(recordsAudio: boolean): void {
    this.recordsAudio = recordsAudio;
    this.clips?.setRecordsAudio(recordsAudio);
  }

  /**
   * Speaks `text` once the phrase being said has finished, unless guidance is
   * off or it equals the last phrase asked for.
   */
  speak(text: string): void {
    if (!this.enabled || !text || text === this.lastSpoken) return;
    this.lastSpoken = text;
    if (this.speakingText !== null) {
      this.waitingText = text === this.speakingText ? null : text;
      return;
    }
    this.startPhrase(text);
  }

  /**
   * A new attempt (retry): clears the de-dupe memory so the next `speak` always
   * plays, and forgets the phrase waiting for its turn, which belonged to the
   * attempt that ended. The phrase being said finishes.
   */
  reset(): void {
    this.lastSpoken = null;
    this.waitingText = null;
  }

  /**
   * Stops any in-flight speech or clip, and forgets the phrase waiting for its
   * turn. Call when the liveness screen unmounts.
   */
  stop(): void {
    this.lastSpoken = null;
    this.clearTurnTimer();
    this.speakingText = null;
    this.waitingText = null;
    this.turn += 1;
    this.clips?.stop();
    try {
      Speech.stop();
    } catch {
      /* ignore */
    }
  }

  /** Stops everything and frees the clips. `prepareVoice` may load them again. */
  dispose(): void {
    this.stop();
    this.clips?.release();
    this.clips = null;
  }

  private startPhrase(text: string): void {
    this.speakingText = text;
    const turn = ++this.turn;
    const finished = () => this.finishPhrase(turn);
    // An end event that never comes (an engine that drops its callback, a
    // clip the player never finishes) must not silence every prompt after it.
    const clips = this.clips;
    const grace = clips?.pending(text) ? this.clipGraceMs : 0;
    this.setTurnTimer(finished, longestPhraseMs(text) + grace);
    this.silenceLeftovers();
    if (clips?.play(text, finished)) return;
    if (!clips || grace === 0) {
      this.sayWithDeviceVoice(text, finished);
      return;
    }
    // Its clip is still landing: give it a moment rather than say this one in
    // a different voice from the rest. Stopped or overtaken meanwhile, nothing.
    void clips.waitFor(text, grace).then(() => {
      if (turn !== this.turn || this.speakingText !== text) return;
      if (this.clips === clips && clips.play(text, finished)) return;
      this.sayWithDeviceVoice(text, finished);
    });
  }

  /** The phrase has been said: pause, then say the one waiting, if any. */
  private finishPhrase(ofTurn: number): void {
    if (ofTurn !== this.turn || this.speakingText === null) return;
    this.setTurnTimer(() => {
      this.speakingText = null;
      const next = this.waitingText;
      this.waitingText = null;
      if (next !== null) this.startPhrase(next);
    }, PAUSE_BETWEEN_PHRASES_MS);
  }

  private sayWithDeviceVoice(text: string, finished: () => void): void {
    try {
      this.spokeBefore = true;
      Speech.speak(text, {
        language: this.language,
        ...(this.deviceVoice ? { voice: this.deviceVoice } : {}),
        onDone: finished,
        onStopped: finished,
        onError: finished,
      });
    } catch {
      // TTS is best-effort: a failure must never block the flow, or the queue.
      finished();
    }
  }

  /**
   * Silences what a watchdog-ended phrase may still be saying, so it never
   * overlaps the next. Before anything has been spoken there is nothing to
   * stop, and on Android calling stop() against a still-initialising engine is
   * exactly the poke that can eat the first queued utterance, so the device
   * voice is stopped only once a phrase has actually been issued.
   */
  private silenceLeftovers(): void {
    this.clips?.stop();
    try {
      if (this.spokeBefore) Speech.stop();
    } catch {
      /* best-effort */
    }
  }

  private setTurnTimer(run: () => void, ms: number): void {
    this.clearTurnTimer();
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      run();
    }, ms);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }
}
