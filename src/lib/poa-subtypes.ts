import type { TextFn } from '../i18n/types';
import type { PoaDocumentSubtype, PoaDocumentType, ProofOfAddressConfig } from '../types/workflow';

// ---------------------------------------------------------------------------
// The documents each proof-of-address kind is made of, as business documents
// sit inside their groups. The applicant picks the kind; the server's reader
// recognises which document within it was uploaded (user decision 2026-11-07).
//
// Mirrors the web SDK's lib/poa-subtypes.ts and kyc-core's
// POA_DOCUMENT_SUBTYPES (src/lib/proof-of-address/types.ts). The keys are an
// add-only contract.
// ---------------------------------------------------------------------------

export const POA_SUBTYPES_BY_KIND: Record<PoaDocumentType, readonly PoaDocumentSubtype[]> = {
  utility_bill: ['electricity_bill', 'water_bill', 'gas_bill', 'internet_bill', 'phone_bill', 'waste_bill'],
  bank_statement: ['bank_statement', 'credit_card_statement', 'mortgage_statement', 'loan_statement'],
  tenancy_agreement: ['tenancy_agreement', 'lease_agreement', 'property_title'],
  government_document: [
    'tax_document',
    'property_rates_bill',
    'voter_registration',
    'voter_id',
    'benefits_letter',
    'government_letter',
  ],
  other: ['insurance_document', 'employer_letter', 'education_letter', 'other_document'],
};

const ALL = new Set<string>(Object.values(POA_SUBTYPES_BY_KIND).flat());

const camel = (subtype: PoaDocumentSubtype): string =>
  subtype.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** A subtype's text key: `proofOfAddress.subtype.electricityBill`. */
export const poaSubtypeKey = (subtype: PoaDocumentSubtype): string => `proofOfAddress.subtype.${camel(subtype)}`;

/**
 * The subtypes accepted inside one kind. The workflow's `documentSubtypes`
 * narrows a kind only where it names at least one of that kind's subtypes;
 * a kind it says nothing about keeps all of them.
 */
export function acceptedSubtypes(
  kind: PoaDocumentType,
  configured: readonly string[] | undefined,
): PoaDocumentSubtype[] {
  const own = POA_SUBTYPES_BY_KIND[kind];
  const picked = (configured ?? []).filter((s) => ALL.has(s));
  const narrowed = own.filter((s) => picked.includes(s));
  return narrowed.length > 0 ? narrowed : [...own];
}

/**
 * "a or b", "a, b, or c": the English disjunction `Intl.ListFormat('en')`
 * writes, for an engine without it (Hermes ships no ListFormat), so the phrase
 * reads as it does on the web SDK.
 */
function englishOr(words: string[]): string {
  if (words.length <= 1) return words.join('');
  if (words.length === 2) return `${words[0]} or ${words[1]}`;
  return `${words.slice(0, -1).join(', ')}, or ${words[words.length - 1]}`;
}

/** Words joined the language's own way ("or"), where the engine knows how. */
export function joinWithOr(words: string[], language: string | undefined): string {
  const ListFormat = (Intl as unknown as {
    ListFormat?: new (locale: string, options: { type: 'disjunction' }) => { format: (list: string[]) => string };
  }).ListFormat;
  if (ListFormat) {
    try {
      return new ListFormat(language || 'en', { type: 'disjunction' }).format(words);
    } catch {
      // An unknown language tag: fall through to the English join.
    }
  }
  return englishOr(words);
}

/**
 * A kind's documents in one short phrase: "Electricity, water, gas or
 * internet". The short names are lower case so they read inside a sentence;
 * the phrase gets its capital here.
 */
export function poaKindSummary(
  kind: PoaDocumentType,
  configured: readonly string[] | undefined,
  t: TextFn,
  language: string | undefined,
): string {
  const words = acceptedSubtypes(kind, configured).map((s) => t(`proofOfAddress.subtypeShort.${camel(s)}`));
  const phrase = joinWithOr(words, language);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** The window a kind's document must fall within, in days (0 = any date). */
export function poaKindDays(poa: ProofOfAddressConfig | undefined | null, kind: PoaDocumentType): number {
  return poa?.documentValidity?.[kind] ?? poa?.maxAgeDays ?? 90;
}

/** "3 months", "1 year", "Any date". */
export function poaPeriodLabel(days: number, t: TextFn): string {
  if (days <= 0) return t('proofOfAddress.validity.any');
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? t('proofOfAddress.validity.year') : t('proofOfAddress.validity.years', { count: years });
  }
  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? t('proofOfAddress.validity.month') : t('proofOfAddress.validity.months', { count: months });
}
