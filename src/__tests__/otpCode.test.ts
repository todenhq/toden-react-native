import { otpCodeFrom, pastedCode } from '../lib/otp-code';

// A MIRROR of the web SDK's lib/otp-code.test.ts and the Flutter SDK's
// test/otp_code_test.dart: the same cases with the same answers.
describe('otpCodeFrom', () => {
  it('keeps what is typed, digits only', () => {
    expect(otpCodeFrom('12', '1', 6)).toBe('12');
    expect(otpCodeFrom('12a', '12', 6)).toBe('12');
  });

  it('finds the code in the sentence it was copied from', () => {
    expect(otpCodeFrom('Your code is 123456. It expires soon.', '', 6)).toBe('123456');
    expect(otpCodeFrom('Order 88: your code is 123456', '', 6)).toBe('123456');
  });

  it('reads a code copied with a space or dash', () => {
    expect(otpCodeFrom('123 456', '', 6)).toBe('123456');
    expect(otpCodeFrom('123-456', '', 6)).toBe('123456');
  });

  it('keeps the paste, not the half-typed digits it landed on', () => {
    expect(otpCodeFrom('12123456', '12', 6)).toBe('123456');
  });

  it('ignores a digit typed past the end', () => {
    expect(otpCodeFrom('1234567', '123456', 6)).toBe('123456');
  });

  it('follows the workflow code length', () => {
    expect(otpCodeFrom('code 1234', '', 4)).toBe('1234');
    expect(otpCodeFrom('code 12345678', '', 8)).toBe('12345678');
  });
});

describe('pastedCode', () => {
  it('takes a code, however it was copied', () => {
    expect(pastedCode('Your code is 123456', 6)).toBe('123456');
    expect(pastedCode('123 456', 6)).toBe('123456');
  });

  it('refuses what is not a code', () => {
    expect(pastedCode('08031234567', 6)).toBeNull();
    expect(pastedCode('hello', 6)).toBeNull();
    expect(pastedCode('', 6)).toBeNull();
  });
});
