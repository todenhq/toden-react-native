// Which company document put a person in the key-people list, so taking the
// document back takes its people back too.
//
// An applicant can upload a MEMART, reach the key-people step with its people
// filled in, then go back and replace or remove it. The people of a file they
// took back must not stay in the list as if the company had declared them. So
// a row a document added remembers the document (sourceDocuments) and how it
// looked when added (documentSnapshot). When documents change:
//   - a person named by another document still uploaded stays;
//   - a person whose documents are all gone is removed, unless the applicant
//     changed them since (added an email, fixed a name): that row stays, flagged
//     documentRemoved, and the step asks them to check it still belongs.
// A row the applicant or the register added is never touched. None of these
// fields is ever sent (the submission builds the payload field by field).
//
// Pure. Mirrors the web SDK's lib/document-people-sources.ts and the Flutter
// SDK's config/document_people_sources.dart: keep the three in lockstep.
import type { KeyPersonEntry } from './keyPeople';

/** What the applicant can change on a row, as one string, to tell an edit apart. */
export function rowFingerprint(row: KeyPersonEntry): string {
  return JSON.stringify([
    row.name.trim(),
    [...row.roles].sort(),
    (row.title ?? '').trim(),
    row.email.trim(),
    row.country.trim().toUpperCase(),
    row.ownershipPct.trim(),
    row.isCorporate,
    row.registrationNumber.trim(),
    row.owners.map((o) => [o.name.trim(), o.ownershipPct.trim(), o.email.trim(), o.country.trim()]),
  ]);
}

/** Whether the applicant has changed a document's row since it was added. */
export function editedSinceDocument(row: KeyPersonEntry): boolean {
  return row.documentSnapshot != null && rowFingerprint(row) !== row.documentSnapshot;
}

/** A row a document has just added, remembering the document and its first form. */
export function addedByDocument(row: KeyPersonEntry, mediaId: string): KeyPersonEntry {
  const next = { ...row, sourceDocuments: [mediaId], documentRemoved: undefined };
  return { ...next, documentSnapshot: rowFingerprint(next) };
}

/**
 * An existing row another document also names. A document's row gains the
 * document (so it stays while either is uploaded) and, when the applicant had
 * not changed it, a fresh snapshot of what the merge filled in. A row the
 * applicant typed keeps no provenance: it was theirs before any document.
 */
export function namedByDocument(before: KeyPersonEntry, after: KeyPersonEntry, mediaId: string): KeyPersonEntry {
  const sources = before.sourceDocuments;
  if (!sources && !before.documentRemoved) return after;
  const edited = editedSinceDocument(before);
  const next: KeyPersonEntry = {
    ...after,
    sourceDocuments: [...new Set([...(sources ?? []), mediaId])],
    documentRemoved: undefined,
  };
  return { ...next, documentSnapshot: edited || before.documentRemoved ? before.documentSnapshot : rowFingerprint(next) };
}

/**
 * The list after documents were removed or replaced: `uploaded` is every
 * document still in the application. Unchanged (the same array) when nothing
 * the documents added is affected, so a caller can skip a dispatch.
 */
export function withoutRemovedDocuments(
  rows: KeyPersonEntry[],
  uploaded: ReadonlySet<string>,
): { rows: KeyPersonEntry[]; removed: number; kept: number } {
  let removed = 0;
  let kept = 0;
  let changed = false;
  const next: KeyPersonEntry[] = [];
  for (const row of rows) {
    const sources = row.sourceDocuments;
    if (!sources || sources.length === 0) {
      next.push(row);
      continue;
    }
    const remaining = sources.filter((m) => uploaded.has(m));
    if (remaining.length === sources.length) {
      next.push(row);
      continue;
    }
    changed = true;
    if (remaining.length > 0) {
      next.push({ ...row, sourceDocuments: remaining });
    } else if (editedSinceDocument(row)) {
      kept += 1;
      next.push({ ...row, sourceDocuments: [], documentRemoved: true });
    } else {
      removed += 1;
    }
  }
  return { rows: changed ? next : rows, removed, kept };
}
