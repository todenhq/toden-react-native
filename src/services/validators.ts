import type { IdType, SupportedCountry } from '../types/config';

// Per-ID-type format validation — identical rules to the web SDK's
// `utils/validators.ts` and the Flutter SDK's `validators.dart`.

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const DIGITS_ONLY = /^\d+$/;

function digitsExact(value: string, count: number, label: string): ValidationResult {
  if (!DIGITS_ONLY.test(value)) {
    return { valid: false, message: `${label} must contain only digits` };
  }
  if (value.length !== count) {
    return { valid: false, message: `${label} must be exactly ${count} digits` };
  }
  return { valid: true };
}

function matchesPattern(value: string, pattern: RegExp, label: string, hint: string): ValidationResult {
  if (!pattern.test(value)) {
    return { valid: false, message: `Invalid ${label} format (${hint})` };
  }
  return { valid: true };
}

// A Nigerian mobile number, typed as 0803…, +234 803… or 803…. The server
// brings it to the 11-digit local form (kyc-core lib/id-number-format/rules.ts);
// this accepts exactly what that rule accepts.
export function normaliseNgPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (/^234[789]\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^[789]\d{9}$/.test(digits)) return `0${digits}`;
  return digits;
}

function ngPhone(value: string): ValidationResult {
  if (/[A-Za-z]/.test(value)) return { valid: false, message: 'Phone number must contain only digits' };
  return /^0[789]\d{9}$/.test(normaliseNgPhone(value))
    ? { valid: true }
    : { valid: false, message: 'Enter a Nigerian mobile number, for example 08031234567' };
}

/** The ID types looked up by a phone number, which take the phone keypad. */
export function isPhoneIdType(idType: string | null | undefined): boolean {
  return idType === 'phone-number' || idType === 'nin-phone';
}

// ---------------------------------------------------------------------------
// Per-ID-type validators (country-prefixed where a key is shared across countries)
// ---------------------------------------------------------------------------

const validators: Record<string, (value: string) => ValidationResult> = {
  // Nigeria
  bvn: (v) => digitsExact(v, 11, 'BVN'),
  'bvn-premium': (v) => digitsExact(v, 11, 'BVN'),
  // Tax ID lookups are keyed off the person's NIN — the typed number is a NIN.
  'tax-id': (v) => digitsExact(v, 11, 'NIN'),
  nin: (v) => digitsExact(v, 11, 'NIN'),
  'phone-number': ngPhone,
  'nin-phone': ngPhone,
  vnin: (v) => {
    if (v.length !== 16) {
      return { valid: false, message: 'vNIN must be exactly 16 characters' };
    }
    return { valid: true };
  },
  'ng-passport': (v) => matchesPattern(v, /^[A-Z]\d{8}$/, 'Passport', 'e.g. A12345678'),
  'ng-drivers-license': (v) => matchesPattern(v, /^[A-Z]{3}\d{5,12}$/, "Driver's License", 'e.g. ABC12345'),
  pvc: (v) => digitsExact(v, 19, "Voter's Card (PVC)"),

  // Ghana
  'ghana-card': (v) => matchesPattern(v, /^GHA-\d{9}-\d$/, 'Ghana Card', 'e.g. GHA-123456789-0'),
  'gh-voters': (v) => digitsExact(v, 10, "Voter's Card"),
  ssnit: (v) => digitsExact(v, 13, 'SSNIT'),
  'gh-passport': (v) => matchesPattern(v, /^[A-Z]\d{7}$/, 'Passport', 'e.g. A1234567'),

  // Kenya
  'ke-national-id': (v) => digitsExact(v, 8, 'National ID'),

  // South Africa
  'za-national-id': (v) => digitsExact(v, 13, 'National ID'),
};

function resolveKey(country: SupportedCountry, idType: IdType): string {
  // Some ID types share a name across countries (passport, drivers-license,
  // national-id, voters). Prefix those with the country code so they map to the
  // country-specific validator.
  const needsPrefix: Record<string, Set<string>> = {
    passport: new Set(['NG', 'GH']),
    'drivers-license': new Set(['NG']),
    'national-id': new Set(['KE', 'ZA']),
    voters: new Set(['GH']),
  };

  const prefixSet = needsPrefix[idType];
  if (prefixSet?.has(country)) {
    return `${country.toLowerCase()}-${idType}`;
  }
  return idType;
}

export function validateIdNumber(
  country: SupportedCountry,
  idType: IdType,
  value: string,
): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, message: 'ID number is required' };
  }
  const validator = validators[resolveKey(country, idType)];
  if (!validator) {
    // No specific validator — accept non-empty input.
    return { valid: true };
  }
  return validator(trimmed);
}

/** Masks an ID number for display — never log the raw value. */
export function maskIdNumber(idNumber: string): string {
  if (idNumber.length <= 7) return idNumber;
  const first4 = idNumber.slice(0, 4);
  const last3 = idNumber.slice(-3);
  const masked = '*'.repeat(idNumber.length - 7);
  return `${first4}${masked}${last3}`;
}
