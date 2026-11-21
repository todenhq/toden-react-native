import { readFileSync } from 'fs';
import { join } from 'path';

import { defaultText } from '../i18n/translate';
import { describeInMonorepo, sharedVectors } from './helpers/monorepo';

// ─── The card turns over in the frame ────────────────────────────────────────
//
// The web SDK's turn-over (steps/DocumentCaptureStep.tsx `turningOver`,
// components/viewfinder/DocumentGhost.tsx `turnFrom`/`holding`, 2026-11-18):
// between the two sides of a card the camera keeps running, the sample
// already in the frame turns over where it stands, the hint line says to turn
// the card, the side badge reads BACK, and the shutter is held with that
// reason. No separate turn-over card over the camera. Read from the sources:
// these screens need a camera to render.

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the turn-over plays in the frame', () => {
  const overlay = read('components/viewfinder/ImmersiveOverlay.tsx');
  const guide = read('components/viewfinder/ImmersiveGuide.tsx');
  const ghost = read('components/viewfinder/DocumentGhost.tsx');
  const viewfinder = read('components/CameraViewfinder.tsx');

  it('draws no separate turn-over card over the camera', () => {
    expect(overlay).not.toContain('TurnOverPrompt');
    expect(read('components/viewfinder/TurnOverPrompt.tsx')).not.toMatch(/export function TurnOverPrompt|rgba\(4,2,24/);
  });

  it('turns the sample already in the frame over where it stands, from the front', () => {
    expect(overlay).toContain("turnFrom={p.turnedOver ? 'front' : null}");
    expect(overlay).toContain('holding={p.turning}');
    expect(guide).toContain('turnFrom={turnFrom}');
    // The same box as the sample it replaces: the guide's own rect.
    expect(ghost).toMatch(/style=\{\{ position: 'absolute', left: x, top: y, width, height, opacity \}\}>\s*<Animated\.View style=\{face\('0deg', '180deg'/);
  });

  it('keeps the back’s sample in the frame for the back scan, untimed until the turn ends', () => {
    // No longer hidden after the turn-over.
    expect(guide).not.toContain('showSpecimen');
    expect(ghost).toMatch(/if \(holding\) return undefined;\s*shownAt\.current = Date\.now\(\);/);
    expect(ghost).toContain('if (!documentFound || holding) return undefined;');
  });

  it('says to turn the card in the hint line, and holds the shutter with that reason', () => {
    expect(viewfinder).toContain("const turnText = t('uploadDocument.flipBanner');");
    expect(viewfinder).toContain('const shownHint = turning ? turnText : hint;');
    expect(viewfinder).toContain('const shownBlockedHint = turning ? turnText : blockedHint;');
    expect(viewfinder).toContain('blockedHint={shownBlockedHint}');
    expect(viewfinder).toContain('if (turningRef.current) return;');
    // The controls stay where they are; only the gallery goes while it turns.
    expect(overlay).toContain('allowUpload={!!p.onUpload && !p.turning}');
    expect(overlay).not.toMatch(/p\.turning \? null : \(\s*<BottomBar/);
  });

  it('has the side badge on BACK from the start of the turn, with the camera running on', () => {
    expect(viewfinder).toContain("const turnedOver = !!turnOver && !!fill && side === 'back';");
    expect(overlay).toContain('side={p.side}');
    // One camera for both sides: the side is a prop, never a remount.
    expect(viewfinder).toMatch(/<Camera\s+ref=\{cameraRef\}/);
  });
});

describeInMonorepo('the turn-over words', () => {
  it('are the contract’s, starting "Good." as a passed gesture does', () => {
    const vectors = sharedVectors<{ texts: { key: string; default: string }[] }>(
      'sdk-flutter/test/customisable_texts_vectors.json',
      { texts: [] },
    );
    const contract = vectors.texts.find((v) => v.key === 'uploadDocument.flipBanner');
    expect(defaultText('uploadDocument.flipBanner')).toBe('Good. Now flip your card over to scan the back.');
    expect(contract?.default).toBe(defaultText('uploadDocument.flipBanner'));
  });
});
