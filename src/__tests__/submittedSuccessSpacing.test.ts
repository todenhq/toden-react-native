import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// space-between leaves no gap once the content fills the screen, which put the
// address check card flush against Done (user report 2026-11-01).
describe('the success screen', () => {
  it('keeps a fixed gap between its content and the Done button', () => {
    const source = readFileSync(join(__dirname, '../screens/SubmittedSuccess.tsx'), 'utf8');
    expect(source).toContain("<View style={{ alignItems: 'center', marginBottom: spacing.lg }}>");
  });
});
