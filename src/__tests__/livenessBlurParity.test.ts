import { readFileSync } from 'fs';
import { join } from 'path';
import { LIVENESS_BLUR } from '../lib/livenessCutout';

// The blur round the liveness window is the web's blur(2px) on both phones:
// Android by radius, iOS by holding the system material at a share of its
// strength (it has no radius). The native files carry the numbers, so they
// are read here.

const root = join(__dirname, '..', '..');
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

function findKotlin(): string {
  const { execSync } = require('child_process') as typeof import('child_process');
  return execSync('find android -name BackdropBlurView.kt', { cwd: root }).toString().trim().split('\n')[0]!;
}

describe('the blur round the liveness window', () => {
  it('is the web\'s 2 points', () => {
    expect(LIVENESS_BLUR).toBe(2);
  });

  it('is that radius on Android', () => {
    expect(read(findKotlin())).toMatch(new RegExp(`const val RADIUS_DP = ${LIVENESS_BLUR}f`));
  });

  it('is a small share of the system material on iOS, held by a paused animator and set again after the app returns', () => {
    const swift = read('ios/HybridMyazaBackdropBlur.swift');
    const fraction = Number(/let BACKDROP_BLUR_FRACTION: CGFloat = ([0-9.]+)/.exec(swift)?.[1]);
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThan(0.3);
    expect(swift).toContain('held.pausesOnCompletion = true');
    expect(swift).toContain('held.fractionComplete = BACKDROP_BLUR_FRACTION');
    expect(swift).toContain('UIApplication.willEnterForegroundNotification');
    expect(swift).toContain('animator?.stopAnimation(true)');
  });
});
