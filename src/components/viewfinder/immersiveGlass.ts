import type { DocumentFraming, DocumentHint } from '../../capture/documentIdentity';
import { mixHex } from '../../lib/captureRing';

// ---------------------------------------------------------------------------
// The one surface every control over the full-screen camera sits on: a dark
// glass with a hairline edge. Flat rather than Liquid Glass so the back button,
// the pills and the bottom buttons read as one set over any scene.
// ---------------------------------------------------------------------------

export const IMMERSIVE_GLASS = {
  fill: 'rgba(12,14,22,0.62)',
  /** The fill while pressed: a background change only, never a layout shift. */
  pressed: 'rgba(12,14,22,0.82)',
  border: 'rgba(255,255,255,0.14)',
  text: '#FFFFFF',
  caption: 'rgba(255,255,255,0.85)',
} as const;

/** The colour of the instruction's status icon. */
export type HintTone = 'neutral' | 'action' | 'ready' | 'warning';

/**
 * Sorts the capture gate's current hint into a tone, from states the gate
 * already reports; it decides nothing new.
 */
export function immersiveHintTone(p: {
  hint: DocumentHint;
  framing: DocumentFraming;
  hintIsAction: boolean;
  /** The corner gate is holding the shutter. */
  blocked: boolean;
}): HintTone {
  if (p.blocked) return 'action';
  if (p.hint === 'moreLight' || p.hint === 'wrongDocument' || p.framing === 'wrongShape') return 'warning';
  if (p.framing === 'holding' || p.framing === 'ready' || p.hint === 'holdStill' || p.hint === 'captured') return 'ready';
  return p.hintIsAction ? 'action' : 'neutral';
}

/** The brand colour lifted towards white so it reads on the dark glass. */
export function primaryOnDark(primary: string): string {
  return /^#[0-9a-f]{6}$/i.test(primary) ? mixHex(primary, '#FFFFFF', 0.35) : primary;
}
