import { otpKeyboard } from '../lib/otp-keyboard';
import { otpPlaceholder } from '../lib/otp-code';

// The workflow's `alphanumericCode` swaps the number pad for a capitalising
// keyboard without autocorrect. Off (or absent), the field asks for exactly
// what it did before: the number pad, nothing else.
describe('code field keyboard', () => {
  it('keeps the number pad, and only that, for digits', () => {
    expect(otpKeyboard(false)).toEqual({ keyboardType: 'number-pad' });
  });

  it('asks for letters, capitalised and never corrected, when the workflow does', () => {
    expect(otpKeyboard(true)).toEqual({ keyboardType: 'default', autoCapitalize: 'characters', autoCorrect: false });
  });

  it('does not suggest digits in the plain field when letters are on', () => {
    expect(otpPlaceholder(6)).toBe('000000');
    expect(otpPlaceholder(6, true)).toBe('A2B3C4');
    expect(otpPlaceholder(4, true)).toBe('A2B3');
  });
});
