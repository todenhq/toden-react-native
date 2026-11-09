import {
  backgroundPrimerDecision,
  confirmWithinDays,
  effortSentence,
  effortWithoutBackground,
  finishSentence,
  withinSentence,
} from '../presence/background-primer';

// Mirrored by the Flutter SDK's presence_background_primer_test.dart.

describe('when the background ask is made', () => {
  const base = { wantsBackground: true, registered: true, alwaysGranted: false, resumed: false };

  it('shows the explanation first when the person has not granted it', () => {
    expect(backgroundPrimerDecision(base)).toBe('primer');
  });

  it('arms with no prompt when it is already granted', () => {
    expect(backgroundPrimerDecision({ ...base, alwaysGranted: true })).toBe('silent');
  });

  it('asks nothing when background is off, unregistered, or the screen is shown again', () => {
    expect(backgroundPrimerDecision({ ...base, wantsBackground: false })).toBe('skip');
    expect(backgroundPrimerDecision({ ...base, registered: false })).toBe('skip');
    expect(backgroundPrimerDecision({ ...base, resumed: true })).toBe('skip');
  });
});

describe('the effort without background checks', () => {
  it('counts app opens at 0.6 each, as the server scores them', () => {
    // 3 nights at 0.6 a night is 5 evenings; 5 days would be 9.
    expect(effortWithoutBackground(undefined, false)).toEqual({ count: 5, unit: 'evenings' });
  });

  it('counts days only for a business premises', () => {
    expect(effortWithoutBackground(undefined, true)).toEqual({ count: 9, unit: 'days' });
    expect(effortWithoutBackground({ minNights: 0, minDays: 3 }, false)).toEqual({ count: 5, unit: 'days' });
  });

  it('follows the workflow policy', () => {
    expect(effortWithoutBackground({ minNights: 6, minDays: 2 }, false)).toEqual({ count: 4, unit: 'days' });
    expect(confirmWithinDays({ windowDays: 14 })).toBe(14);
    expect(confirmWithinDays(undefined)).toBe(10);
  });

  it('words the lines for a person and a business', () => {
    expect(effortSentence({ count: 5, unit: 'evenings' }, false)).toBe(
      'Otherwise, open the app at home on 5 different evenings.',
    );
    expect(effortSentence({ count: 1, unit: 'days' }, true)).toBe('Otherwise, open the app at the premises on 1 day.');
    expect(withinSentence(10)).toBe('Usually confirmed within 10 days.');
    expect(finishSentence({ count: 9, unit: 'days' }, true)).toBe(
      'Open the app at the premises on 9 days to finish, or continue with automatic checks.',
    );
  });
});
