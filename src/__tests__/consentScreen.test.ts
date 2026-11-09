import { readFileSync } from 'fs';
import { join } from 'path';

import { DEFAULT_TEXTS } from '../i18n/defaults';

// The consent screen as the web SDK redesigned it (2026-11-08): Toden's mark
// on a muted square (the org's logo or a shield on a white-label flow), the
// steps as an inset grouped list with no numbers, Continue with no arrow,
// and no shadow on the list in light mode.

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the consent screen', () => {
  it('shows the emblem and the grouped list in place of the old hero and card', () => {
    const step = read('screens/ConsentStep.tsx');
    expect(step).toContain('<ConsentEmblem />');
    expect(step).toContain('<ConsentJourney steps={steps}');
    expect(step).not.toContain('Circle');
    expect(step).not.toContain('trailingIcon');
  });

  it("draws Toden's mark in the footer's colours, never on a white-label flow", () => {
    const emblem = read('screens/consent/ConsentEmblem.tsx');
    expect(emblem).toContain('needsProcessorDisclosure(');
    expect(emblem).toContain('brandMarkColor(colors.background)');
    expect(emblem).toMatch(/!whiteLabel \?\s*\(\s*<TodenMark/);
    expect(emblem).toContain('borderRadius: 20');
  });

  it('lists the steps without numbers, and casts a shadow on a dark sheet only', () => {
    const journey = read('screens/consent/ConsentJourney.tsx');
    expect(journey).not.toMatch(/index \+ 1|`\$\{index/);
    expect(journey).toMatch(/mode === 'dark'\s*\?\s*\{ shadowColor/);
  });

  it('heads the list in sentence case, as web', () => {
    expect(DEFAULT_TEXTS['welcome.process.heading']).toBe('During this process we will');
  });
});
