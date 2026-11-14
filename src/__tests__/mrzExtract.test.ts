import { sanitizeMrzLine } from '../mrz/extract';

describe('ML Kit filler mangling (Android)', () => {
  it('maps guillemets back to fillers instead of deleting them', () => {
    // ML Kit's latin model reads OCR-B '<<' as '«'. Deleting it (the old
    // behaviour) shortened the line past fit()'s tolerance and the whole MRZ
    // was discarded — the reported "had to rescan at the chip step" bug.
    expect(sanitizeMrzLine('P«NGAOKEKE««CHINEDU‹OBINNA')).toBe(
      'P<<NGAOKEKE<<<<CHINEDU<OBINNA',
    );
    expect(sanitizeMrzLine('abc»def')).toBe('ABC<<DEF');
  });
});
