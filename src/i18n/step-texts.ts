// ---------------------------------------------------------------------------
// Texts the Proof of Address step, the ID country row, the business country
// row and the selfie's final capture show that are NOT customisable (the shared list,
// sdk-flutter/test/customisable_texts_vectors.json, does not carry them).
//
// Mirrors the web SDK's i18n/groups (proofOfAddress.ts, selectDocument.ts,
// business-country.ts, business-details.ts, presence-capture.ts): the same keys, the same wording
// byte for byte, pinned by stepTexts.test.ts. Kept apart from DEFAULT_TEXTS,
// which holds customisable keys only; `t()` reads them after it.
// ---------------------------------------------------------------------------

/** Proof of Address step: the country row, the kinds, the sheet, the tiles. */
const PROOF_OF_ADDRESS: Readonly<Record<string, string>> = {
  'proofOfAddress.country.residence': 'Your address is in',
  'proofOfAddress.country.change': 'Change',
  'proofOfAddress.country.choose': 'Choose',
  'proofOfAddress.country.selected': 'Selected',
  'proofOfAddress.country.placeholder': 'Select country',
  'proofOfAddress.country.search': 'Search countries…',
  'proofOfAddress.country.yourLocation': 'Your location',
  'proofOfAddress.country.noMatches': 'No countries match.',
  'proofOfAddress.subtype.electricityBill': 'Electricity bill',
  'proofOfAddress.subtype.waterBill': 'Water bill',
  'proofOfAddress.subtype.gasBill': 'Gas bill',
  'proofOfAddress.subtype.internetBill': 'Internet or TV bill',
  'proofOfAddress.subtype.phoneBill': 'Phone bill',
  'proofOfAddress.subtype.wasteBill': 'Waste collection bill',
  'proofOfAddress.subtype.bankStatement': 'Bank statement',
  'proofOfAddress.subtype.creditCardStatement': 'Credit card statement',
  'proofOfAddress.subtype.mortgageStatement': 'Mortgage statement',
  'proofOfAddress.subtype.loanStatement': 'Loan statement',
  'proofOfAddress.subtype.tenancyAgreement': 'Tenancy agreement',
  'proofOfAddress.subtype.leaseAgreement': 'Lease agreement',
  'proofOfAddress.subtype.propertyTitle': 'Title deed or property certificate',
  'proofOfAddress.subtype.taxDocument': 'Tax letter or assessment',
  'proofOfAddress.subtype.propertyRatesBill': 'Council tax or property rates bill',
  'proofOfAddress.subtype.voterRegistration': 'Voter registration letter',
  'proofOfAddress.subtype.voterId': "Voter's ID card",
  'proofOfAddress.subtype.benefitsLetter': 'Benefits or pension letter',
  'proofOfAddress.subtype.governmentLetter': 'Other government letter',
  'proofOfAddress.subtype.insuranceDocument': 'Insurance policy or certificate',
  'proofOfAddress.subtype.employerLetter': 'Letter from an employer',
  'proofOfAddress.subtype.educationLetter': 'Letter from a school or university',
  'proofOfAddress.subtype.otherDocument': 'Other document showing your address',
  'proofOfAddress.subtypeShort.electricityBill': 'electricity',
  'proofOfAddress.subtypeShort.waterBill': 'water',
  'proofOfAddress.subtypeShort.gasBill': 'gas',
  'proofOfAddress.subtypeShort.internetBill': 'internet',
  'proofOfAddress.subtypeShort.phoneBill': 'phone',
  'proofOfAddress.subtypeShort.wasteBill': 'waste collection',
  'proofOfAddress.subtypeShort.bankStatement': 'bank',
  'proofOfAddress.subtypeShort.creditCardStatement': 'credit card',
  'proofOfAddress.subtypeShort.mortgageStatement': 'mortgage',
  'proofOfAddress.subtypeShort.loanStatement': 'loan',
  'proofOfAddress.subtypeShort.tenancyAgreement': 'tenancy',
  'proofOfAddress.subtypeShort.leaseAgreement': 'lease',
  'proofOfAddress.subtypeShort.propertyTitle': 'title deed',
  'proofOfAddress.subtypeShort.taxDocument': 'tax',
  'proofOfAddress.subtypeShort.propertyRatesBill': 'property rates',
  'proofOfAddress.subtypeShort.voterRegistration': 'voter registration',
  'proofOfAddress.subtypeShort.voterId': "voter's ID",
  'proofOfAddress.subtypeShort.benefitsLetter': 'benefits',
  'proofOfAddress.subtypeShort.governmentLetter': 'other official letters',
  'proofOfAddress.subtypeShort.insuranceDocument': 'insurance',
  'proofOfAddress.subtypeShort.employerLetter': 'employer',
  'proofOfAddress.subtypeShort.educationLetter': 'school or university',
  'proofOfAddress.subtypeShort.otherDocument': 'other documents',
  'proofOfAddress.validity.month': '1 month',
  'proofOfAddress.validity.months': '{count} months',
  'proofOfAddress.validity.year': '1 year',
  'proofOfAddress.validity.years': '{count} years',
  'proofOfAddress.validity.any': 'Any date',
  'proofOfAddress.accepted.open': 'See accepted documents',
  'proofOfAddress.accepted.title': 'Accepted documents',
  'proofOfAddress.accepted.description': 'Upload any one of these, showing your name and address.',
  'proofOfAddress.accepted.close': 'Close',
  'proofOfAddress.action.camera': 'Take a photo',
  'proofOfAddress.action.cameraHint': 'Use your camera',
  'proofOfAddress.action.file': 'Upload a file',
  'proofOfAddress.action.fileHint': 'PDF or image',
  'proofOfAddress.uploading': 'Uploading…',
  'proofOfAddress.replace': 'Replace',
  'proofOfAddress.remove': 'Remove',
};

/** The ID's country, on the ID-type step (the combined layout). */
const SELECT_DOCUMENT: Readonly<Record<string, string>> = {
  'selectDocument.country.label': 'Your ID was issued in',
  'selectDocument.country.placeholder': 'Select a country',
  'selectDocument.country.change': 'Change',
  'selectDocument.country.choose': 'Choose',
  'selectDocument.country.selected': 'Selected',
  'selectDocument.country.search': 'Search countries…',
  'selectDocument.country.yourLocation': 'Your location',
  'selectDocument.country.noResults': 'No countries found.',
  'selectDocument.combined.title': 'Choose your ID',
  'selectDocument.combined.description': 'Pick the country that issued it, then the ID you will use.',
};

/** The business's country of registration. */
const BUSINESS_COUNTRY: Readonly<Record<string, string>> = {
  'business.country.searchPlaceholder': 'Search countries…',
  'business.country.noMatch': 'No countries match.',
  'business.country.placeholder': 'Select a country',
  'business.country.change': 'Change',
  'business.country.choose': 'Choose',
  'business.country.selected': 'Selected',
  'business.details.countryCaption': 'Registered in',
  'business.details.countryPinnedLocation': 'Your location',
};

/** The selfie's final capture: what to fix before the shutter (liveness/captureGuidance.ts). */
const PRESENCE_CAPTURE: Readonly<Record<string, string>> = {
  'presence.position.lookStraight': 'Kindly look straight at the camera',
  'presence.position.moveCloser': 'Kindly move closer',
};

/** The consent screen's time sentence (screens/consent/copy.ts). */
const WELCOME_TIME: Readonly<Record<string, string>> = {
  'welcome.time.minute': 'It takes about a minute.',
  'welcome.time.minutes': 'It takes about {minutes} minutes.',
};

/** The phone field's country code sheet (components/PhoneNumberInput.tsx). */
const CONTACT: Readonly<Record<string, string>> = {
  'contact.phone.codeTitle': 'Country code',
};

/** Key to its default wording (the web SDK's, byte for byte). */
export const STEP_TEXTS: Readonly<Record<string, string>> = {
  ...WELCOME_TIME,
  ...CONTACT,
  ...PROOF_OF_ADDRESS,
  ...PRESENCE_CAPTURE,
  ...SELECT_DOCUMENT,
  ...BUSINESS_COUNTRY,
};
