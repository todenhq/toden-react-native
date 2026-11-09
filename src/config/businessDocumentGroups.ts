// ---------------------------------------------------------------------------
// Company documents asked for one per GROUP (Didit's model): the documents an
// organisation ticks inside one group are alternatives, and the applicant
// uploads whichever one they hold. A group is required when any document in it
// is required. The step walks the groups one at a time.
//
// MIRRORS kyc-core's src/lib/workflows/business-document-groups.ts (and its
// BUSINESS_DOCUMENT_GROUPS / BUSINESS_DOCUMENT_GROUP_OF), the web SDK's
// lib/business-document-groups.ts and the Flutter SDK's
// config/business_document_groups.dart. Change all four together.
//
// The group titles and step copy are not customisable texts (the shared
// contract in customisable_texts_vectors.json does not name them), so they
// live here as this SDK's own wording, matching the web defaults.
// ---------------------------------------------------------------------------

import type { BusinessDocumentKey, WorkflowBusinessConfig } from '../types/business';
import { resolveBusinessDocumentTypes } from './businessSteps';

export type BusinessDocumentGroupKey =
  | 'legal_presence'
  | 'company_details'
  | 'ownership'
  | 'representative_authorisation'
  | 'address'
  | 'financial'
  | 'tax'
  | 'regulatory'
  | 'other';

/** The groups in the order they are asked for. */
export const BUSINESS_DOCUMENT_GROUP_ORDER: readonly BusinessDocumentGroupKey[] = [
  'legal_presence',
  'company_details',
  'ownership',
  'representative_authorisation',
  'address',
  'financial',
  'tax',
  'regulatory',
  'other',
];

/** Which group each document belongs to. A key this build does not know is 'other'. */
export const BUSINESS_DOCUMENT_GROUP_OF: Record<BusinessDocumentKey, BusinessDocumentGroupKey> = {
  incorporation_certificate: 'legal_presence',
  business_registration: 'legal_presence',
  good_standing_certificate: 'legal_presence',
  registry_extract: 'legal_presence',
  memart: 'company_details',
  annual_return: 'company_details',
  register_of_directors: 'ownership',
  shareholder_register: 'ownership',
  share_certificate: 'ownership',
  ubo_declaration: 'ownership',
  board_resolution: 'representative_authorisation',
  power_of_attorney: 'representative_authorisation',
  authorization_letter: 'representative_authorisation',
  proof_of_address: 'address',
  financial_statements: 'financial',
  tax_document: 'tax',
  regulatory_license: 'regulatory',
  other: 'other',
};

/** Group titles: the web SDK's business.documents.group.* defaults. */
const GROUP_TITLES: Record<BusinessDocumentGroupKey, string> = {
  legal_presence: 'Legal presence',
  company_details: 'Company details',
  ownership: 'Ownership structure',
  representative_authorisation: 'Authority to represent the business',
  address: 'Business address',
  financial: 'Financial statements',
  tax: 'Tax registration',
  regulatory: 'Licences and permits',
  other: 'Other documents',
};

/** A group's display title, or null for a group this build does not know. */
export function businessDocumentGroupTitle(key: string): string | null {
  return Object.prototype.hasOwnProperty.call(GROUP_TITLES, key)
    ? GROUP_TITLES[key as BusinessDocumentGroupKey]
    : null;
}

export interface BusinessDocumentGroup {
  key: BusinessDocumentGroupKey;
  title: string;
  /** The documents that satisfy the group, in the order the workflow lists them. */
  types: Array<{ key: BusinessDocumentKey; label: string; maxAgeMonths: number | null }>;
  required: boolean;
}

/** The groups this flow asks for, in order. Empty when documents are off. */
export function businessDocumentGroups(business: WorkflowBusinessConfig | undefined): BusinessDocumentGroup[] {
  const slots = resolveBusinessDocumentTypes(business);
  return BUSINESS_DOCUMENT_GROUP_ORDER.flatMap((key) => {
    const inGroup = slots.filter((s) => (BUSINESS_DOCUMENT_GROUP_OF[s.key] ?? 'other') === key);
    if (inGroup.length === 0) return [];
    // The 'other' group holds one document whose name the organisation wrote,
    // so that name is a better title than "Other documents".
    const title = key === 'other' && inGroup.length === 1 ? inGroup[0]!.label : GROUP_TITLES[key];
    return [{
      key,
      title,
      types: inGroup.map(({ key: k, label, maxAgeMonths }) => ({ key: k, label, maxAgeMonths })),
      required: inGroup.some((s) => s.required),
    }];
  });
}

/** The upload that satisfies a group, if there is one. */
export function groupUpload<U extends { type: string }>(group: BusinessDocumentGroup, uploads: U[]): U | null {
  return uploads.find((u) => group.types.some((t) => t.key === u.type)) ?? null;
}

/** Where the step opens: the first group with no upload, else the last group. */
export function firstOpenGroupIndex(groups: BusinessDocumentGroup[], uploads: Array<{ type: string }>): number {
  const open = groups.findIndex((g) => groupUpload(g, uploads) === null);
  return open === -1 ? Math.max(groups.length - 1, 0) : open;
}

/**
 * The uploads after adding one: a group holds one document, so an upload
 * replaces whatever the same group already had.
 */
export function withGroupUpload<U extends { type: string }>(
  group: BusinessDocumentGroup,
  uploads: U[],
  upload: U,
): U[] {
  return [...uploads.filter((u) => !group.types.some((t) => t.key === u.type)), upload];
}

/**
 * The documents as the submission sends them: an upload made for a group names
 * its group and the server recognises which document it is; one restored from
 * before groups were sent still names its type (kept as the applicant's own
 * choice, and still found in its group by that type).
 */
export function businessDocumentsPayload(
  uploads: Array<{ type: string; mediaId: string; group?: string }>,
): Array<{ group: string; mediaId: string } | { type: string; mediaId: string }> {
  return uploads.map((u) => (u.group ? { group: u.group, mediaId: u.mediaId } : { type: u.type, mediaId: u.mediaId }));
}

/**
 * What the step's button says: Skip on an optional group with nothing
 * uploaded, Next on every other group but the last, Continue on the last.
 */
export function groupButtonLabel(
  group: BusinessDocumentGroup,
  uploads: Array<{ type: string }>,
  index: number,
  total: number,
): 'skip' | 'next' | 'continue' {
  if (!group.required && groupUpload(group, uploads) === null) return 'skip';
  return index < total - 1 ? 'next' : 'continue';
}

/** Whether the applicant may move past a group. */
export function canLeaveGroup(group: BusinessDocumentGroup, uploads: Array<{ type: string }>): boolean {
  return !group.required || groupUpload(group, uploads) !== null;
}

/** The upload record a restored session can carry (the store's BusinessDocumentUpload). */
export interface RestoredBusinessDocument {
  type: string;
  mediaId: string;
  fileName: string;
  group?: string;
  isPdf?: boolean;
  previewUri?: string;
}

/**
 * A resumed session's uploads, validated so an older snapshot restores less
 * rather than breaking the step. An entry saved before uploads named their
 * group (`{ type, mediaId }`) keeps its type: `groupUpload` finds it in its
 * group by that type, and it is submitted by that type, as before.
 */
export function restoredBusinessDocuments(raw: unknown): RestoredBusinessDocument[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((entry): RestoredBusinessDocument[] => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    if (typeof e['type'] !== 'string' || typeof e['mediaId'] !== 'string') return [];
    const group = typeof e['group'] === 'string' && businessDocumentGroupTitle(e['group']) ? e['group'] : undefined;
    return [{
      type: e['type'],
      mediaId: e['mediaId'],
      fileName: typeof e['fileName'] === 'string' ? e['fileName'] : '',
      ...(group ? { group } : {}),
      ...(e['isPdf'] === true ? { isPdf: true } : {}),
      ...(typeof e['previewUri'] === 'string' ? { previewUri: e['previewUri'] } : {}),
    }];
  });
}
