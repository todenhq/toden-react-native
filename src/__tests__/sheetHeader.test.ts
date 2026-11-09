import { readFileSync } from 'fs';
import { join } from 'path';

import { defaultText } from '../i18n/translate';

// One sheet header for every titled sheet (the web SDK's SheetHeader,
// 2026-11-08): the title, an optional line, the close button on the same row,
// drawn by FloatingSheet. Closing slides the sheet down.

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the sheet header', () => {
  it('is drawn by FloatingSheet, with the close on the title row', () => {
    const sheet = read('components/glass/FloatingSheet.tsx');
    expect(sheet).toMatch(/\{title \? \(/);
    expect(sheet).toContain('accessibilityRole="header"');
  });

  it('is what every titled sheet uses', () => {
    const titled: Record<string, RegExp> = {
      'screens/PoaAcceptedSheet.tsx': /title=\{t\('proofOfAddress\.accepted\.title'\)\}/,
      'screens/KeyPersonSheet.tsx': /title=\{mode === 'add'/,
      'screens/address/DetailsSheet.tsx': /title=\{t\('address\.details\.title'\)\}/,
      'components/UiSelect.tsx': /title=\{sheetTitle \?\? hint\}/,
      'components/UiDateField.tsx': /title=\{title\}/,
      'components/PhoneNumberInput.tsx': /title=\{t\('contact\.phone\.codeTitle'\)\}/,
      'components/CountrySummarySelect.tsx': /title=\{label\}/,
    };
    for (const [rel, pattern] of Object.entries(titled)) expect(read(rel)).toMatch(pattern);
    // Questionnaire selects and dates are titled with the field's label.
    const field = read('screens/QuestionnaireField.tsx');
    expect(field).toContain('sheetTitle={field.label}');
    expect(field).toContain('title={field.label}');
    expect(defaultText('contact.phone.codeTitle')).toBe('Country code');
  });

  it('slides the sheet down on close, the backdrop and back', () => {
    const sheet = read('components/glass/FloatingSheet.tsx');
    expect(sheet).toContain('onRequestClose={dismiss}');
    expect(sheet).toMatch(/onPress=\{dismiss\}\s*accessibilityLabel="Dismiss"/);
    expect(sheet).not.toMatch(/icon="close"\s*onPress=\{onClose\}/);
  });

  it('takes the web default radius where the screen has no curve', () => {
    expect(read('components/glass/FloatingSheet.tsx')).toMatch(/: 28;/);
  });
});
