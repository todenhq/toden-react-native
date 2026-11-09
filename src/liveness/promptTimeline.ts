// ---------------------------------------------------------------------------
// WHEN each gesture prompt appeared and when it passed, measured from the start
// of the liveness recording.
//
// A prompt on its own only proves a gesture HAPPENED. A clip that smiles and
// blinks on repeat meets any of those prompts within seconds. The server reads
// these times against the recording to check the gesture came AFTER it was
// asked for, which a prepared video cannot do on purpose.
//
// They are a claim like the rest of the integrity block: they tell the server
// where to look, and prove nothing by themselves. The flash has its own times
// and a passive hold has no gesture, so neither is listed.
//
// Mirrors the web SDK (liveness/prompt-timeline.ts) and the Flutter SDK
// (liveness/prompt_timeline.dart). Change all three together.
// ---------------------------------------------------------------------------

const GESTURES = new Set(['turn', 'nod', 'blink', 'smile']);

export interface PromptTime {
  prompt: string;
  /** ms from the start of the recording. */
  shownAt: number;
  passedAt: number;
}

interface Entry {
  prompt: string;
  shownAt: number;
  passedAt: number | null;
}

export class PromptTimeline {
  private entries: Entry[] = [];

  /** A prompt appeared. Showing it again (a timer restarted) keeps the first time. */
  shown(prompt: string, at: number): void {
    if (!GESTURES.has(prompt)) return;
    const last = this.entries[this.entries.length - 1];
    if (last && last.passedAt === null && last.prompt === prompt) return;
    this.entries.push({ prompt, shownAt: at, passedAt: null });
  }

  /** The prompt on screen passed. */
  passed(at: number): void {
    const last = this.entries[this.entries.length - 1];
    if (last && last.passedAt === null) last.passedAt = at;
  }

  /** A retry starts again: an earlier attempt's times say nothing about this recording. */
  reset(): void {
    this.entries = [];
  }

  /**
   * The passed prompts against the recording's start, or undefined when there
   * is no recording to measure from or nothing passed. A prompt shown before
   * the recorder went live counts from its first frame.
   */
  report(startedAt: number | null): PromptTime[] | undefined {
    if (startedAt === null) return undefined;
    const done = this.entries.filter((e): e is Entry & { passedAt: number } => e.passedAt !== null);
    if (done.length === 0) return undefined;
    return done.map((e) => ({
      prompt: e.prompt,
      shownAt: Math.max(0, Math.round(e.shownAt - startedAt)),
      passedAt: Math.max(0, Math.round(e.passedAt - startedAt)),
    }));
  }
}
