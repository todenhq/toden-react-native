// Reading a code out of what landed in the code field. A MIRROR of the web
// SDK's lib/otp-code.ts and the Flutter SDK's config/otp_code.dart; change the
// three together.
//
// Two alphabets. Digits only, the default, is unchanged. An ALPHANUMERIC code
// (the workflow's `alphanumericCode`) keeps any ASCII letter or digit, upper-cased:
// the server sends from 23456789ABCDEFGHJKMNPQRSTUVWXYZ but sandbox still sends
// all zeros, and it compares without regard to case.

/** A run of exactly `length` digits standing on its own: "Your code is 123456". */
function standaloneCode(text: string, length: number): string | null {
  return text.split(/\D+/).find((part) => part.length === length) ?? null;
}

/**
 * An alphanumeric code standing on its own in a message. Codes are sent in
 * capitals, so a word with a lower-case letter ("Your", "code") is not one; a
 * run with a digit beats one without ("CODE: K7MP" at length 4).
 */
function standaloneAlphanumeric(text: string, length: number): string | null {
  const runs = text.split(/[^A-Za-z0-9]+/).filter((part) => part.length === length && /^[A-Z0-9]+$/.test(part));
  return runs.find((part) => /\d/.test(part)) ?? runs[0] ?? null;
}

const alphanumerics = (text: string): string => text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const digitsOf = (text: string): string => text.replace(/\D/g, '');

/**
 * The code in the field after an edit. `previous` tells typing from a paste: a
 * paste over a half-typed code keeps what was pasted, not what was there.
 */
export function otpCodeFrom(raw: string, previous: string, length: number, alphanumeric = false): string {
  const code = alphanumeric ? standaloneAlphanumeric(raw, length) : standaloneCode(raw, length);
  if (code) return code;
  const kept = alphanumeric ? alphanumerics(raw) : digitsOf(raw);
  if (kept.length <= length) return kept;
  return raw.length - previous.length > 1 ? kept.slice(-length) : kept.slice(0, length);
}

/**
 * The code on the clipboard, or null when there isn't one. Stricter than typing:
 * a phone number or an order reference must not fill the boxes.
 */
export function pastedCode(text: string, length: number, alphanumeric = false): string | null {
  const code = alphanumeric ? standaloneAlphanumeric(text, length) : standaloneCode(text, length);
  if (code) return code;
  const kept = alphanumeric ? alphanumerics(text) : digitsOf(text);
  return kept.length === length ? kept : null;
}

/** The plain field's placeholder: zeros for digits, a mixed sample otherwise. */
export function otpPlaceholder(length: number, alphanumeric = false): string {
  return alphanumeric ? 'A2B3C4D5'.slice(0, length) : '0'.repeat(length);
}
