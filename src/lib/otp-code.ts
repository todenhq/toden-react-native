// Reading a code out of what landed in the code field. A MIRROR of the web
// SDK's lib/otp-code.ts and the Flutter SDK's config/otp_code.dart; change the
// three together.

/** A run of exactly `length` digits standing on its own: "Your code is 123456". */
function standaloneCode(text: string, length: number): string | null {
  return text.split(/\D+/).find((part) => part.length === length) ?? null;
}

/**
 * The code in the field after an edit. `previous` tells typing from a paste: a
 * paste over a half-typed code keeps what was pasted, not what was there.
 */
export function otpCodeFrom(raw: string, previous: string, length: number): string {
  const code = standaloneCode(raw, length);
  if (code) return code;
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= length) return digits;
  return raw.length - previous.length > 1 ? digits.slice(-length) : digits.slice(0, length);
}

/**
 * The code on the clipboard, or null when there isn't one. Stricter than typing:
 * a phone number or an order reference must not fill the boxes.
 */
export function pastedCode(text: string, length: number): string | null {
  const code = standaloneCode(text, length);
  if (code) return code;
  const digits = text.replace(/\D/g, '');
  return digits.length === length ? digits : null;
}
