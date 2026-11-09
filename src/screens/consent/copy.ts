import type { IconName } from '../../components/Icon';
import type { TextFn } from '../../i18n/types';

// The consent screen's fixed copy: the variant titles and descriptions (not
// customisable, as on web) and the process bullets, which carry text KEYS so
// a workflow's own words reach them. Split from model.ts (200-line rule).

export const DEFAULT_BUSINESS_DESCRIPTION =
  "We're required to confirm your business, and we'll guide you at every step.";

export const SCOPE_TITLES: Record<string, string> = {
  address: 'Address Verification',
  'biometric-authentication': 'Face Check',
  'biometric-enrollment': 'Face Enrolment',
  questionnaire: 'A Few Questions',
  contact: 'Confirm Your Contact Details',
};

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  address: "We're required to confirm your home address, and we'll guide you at every step.",
  'biometric-authentication':
    'A quick face check confirms it is really you. This takes a few seconds and is secure.',
  'biometric-enrollment':
    'A quick selfie sets up face checks for next time, so you will not have to prove your identity again. This takes a few seconds and is secure.',
  questionnaire: 'A few questions keep your account details up to date.',
  contact:
    'We need to re-confirm the email address and phone number on your account. This takes a minute and is secure.',
};

// The address scope's bullets are NOT a fixed pair: it verifies an address by
// the pin, by a document, or by both, so promising a map on a flow that only
// asks for a document is a promise the flow never keeps. Gated below on the
// same step-order predicate the flow itself walks; the document's own bullet is
// appended by the shared post-capture block, like every other flow's.
// Bullets carry text KEYS; buildConsentModel resolves them through `t`.
export type Bullet = { icon: IconName; key: string };

export const ADDRESS_PIN_BULLETS: Bullet[] = [
  { icon: 'map-pin-house', key: 'welcome.process.addressPin' },
  { icon: 'badge-check', key: 'welcome.process.addressDetails' },
];

export const SCOPE_BULLETS: Record<string, Bullet[]> = {
  'biometric-authentication': [
    { icon: 'scan-face', key: 'welcome.process.faceSelfie' },
    { icon: 'badge-check', key: 'welcome.process.faceMatch' },
  ],
  'biometric-enrollment': [
    { icon: 'scan-face', key: 'welcome.process.faceSelfie' },
    { icon: 'badge-check', key: 'welcome.process.faceEnrol' },
  ],
  questionnaire: [{ icon: 'badge-check', key: 'welcome.process.questions' }],
  contact: [{ icon: 'lock', key: 'welcome.process.contactScope' }],
};

/**
 * A SCOPED business workflow's variant title and description: the scope's
 * own screen, worded for the company (lib/scope.ts isScopedBusiness). Text
 * keys, so the defaults live once in i18n/business-variants.ts.
 */
export const BUSINESS_SCOPE_TITLE_KEYS: Record<string, string> = {
  address: 'welcome.title.address.business',
  questionnaire: 'welcome.title.questionnaire.business',
  contact: 'welcome.title.contact.business',
};

export const BUSINESS_SCOPE_DESCRIPTION_KEYS: Record<string, string> = {
  address: 'welcome.description.address.business',
  questionnaire: 'welcome.description.questionnaire.business',
  contact: 'welcome.description.contact.business',
};

export const CONTACT_BULLET_KEYS = {
  both: 'welcome.process.contactEmailAndPhone',
  email: 'welcome.process.contactEmail',
  phone: 'welcome.process.contactPhone',
} as const;

/**
 * About how long each step takes, in seconds: typing a number is quick, a
 * document scan or a selfie is a minute or under, gathering a company's people
 * or papers is longer. Estimates for the time sentence, not measurements; a
 * step not listed counts as half a minute. Mirrors the web SDK's
 * steps/consent-copy.ts STEP_SECONDS.
 */
export const STEP_SECONDS: Record<string, number> = {
  'welcome.process.verifyId': 30,
  'welcome.process.captureDocument': 60,
  'welcome.process.uploadDocument': 45,
  'welcome.process.selfie': 45,
  'welcome.process.faceSelfie': 45,
  'welcome.process.faceMatch': 10,
  'welcome.process.faceEnrol': 10,
  'welcome.process.addressPin': 45,
  'welcome.process.addressDetails': 30,
  'welcome.process.addressMap': 45,
  'welcome.process.proofOfAddress': 60,
  'welcome.process.supportingDocuments': 60,
  'welcome.process.questions': 60,
  'welcome.process.contactScope': 60,
  'welcome.process.contactEmail': 45,
  'welcome.process.contactPhone': 45,
  'welcome.process.contactEmailAndPhone': 90,
  'welcome.process.businessDetails': 90,
  'welcome.process.businessRegistry': 20,
  'welcome.process.keyPeople': 120,
  'welcome.process.businessDocuments': 120,
  'welcome.process.applicant': 150,
};

/** PURE. The whole flow's time, in whole minutes rounded up, at least one. */
export function consentMinutes(steps: ReadonlyArray<{ seconds: number }>): number {
  return Math.max(1, Math.ceil(steps.reduce((sum, s) => sum + s.seconds, 0) / 60));
}

/**
 * "It takes about 3 minutes.": a sentence of its own after the description,
 * which is customisable, and customisable texts carry no values.
 */
export function consentTimeSentence(minutes: number, t: TextFn): string {
  return minutes <= 1 ? t('welcome.time.minute') : t('welcome.time.minutes', { minutes });
}
