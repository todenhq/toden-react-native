import { readFileSync } from 'fs';
import { join } from 'path';

import {
  documentReady,
  primerWords,
  READY_DOCUMENT,
  READY_LIVENESS,
  READY_LIVENESS_PASSIVE,
} from '../components/readyPrimerContent';
import { DEFAULT_TEXTS, NOT_SHOWN } from '../i18n/defaults';
import { createTextFn, defaultText } from '../i18n/translate';
import { describeInMonorepo, sharedVectors } from './helpers/monorepo';

// ─── The screens before the two cameras ──────────────────────────────────────
//
// Ported from the web SDK (components/ReadyPrimer.tsx, ready-primer-content.ts
// and their tests): the liveness intro shows a picture of the camera's window
// and leaves out the stock sentence; the document intro names the document and
// leaves out the stock title and sentence, which the step heading already says.

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the liveness intro', () => {
  it('shows its title and no stock sentence: the picture says it', () => {
    const words = primerWords(READY_LIVENESS, defaultText);
    expect(words.title).toBe("Let's confirm you're really here");
    expect(words.body).toBe('');
    expect(primerWords(READY_LIVENESS_PASSIVE, defaultText).body).toBe('');
  });

  it("still shows a workflow's own sentence, passive or not", () => {
    const t = createTextFn({ en: { 'primer.selfie.body': 'Look at the camera.', 'primer.selfie.bodyPassive': 'Hold still.' } });
    expect(primerWords(READY_LIVENESS, t).body).toBe('Look at the camera.');
    expect(primerWords(READY_LIVENESS_PASSIVE, t).body).toBe('Hold still.');
  });

  it('lists three things, without "put your face in the circle"', () => {
    const words = primerWords(READY_LIVENESS, defaultText);
    expect(words.checklist.map((row) => row.label)).toEqual([
      'Take off glasses, hats, caps or anything covering your face',
      'Choose a bright spot, with the light in front of you',
      'Keep glare and shiny reflections off your face',
    ]);
    expect(READY_LIVENESS.textKeys!.checklist).toEqual([
      'primer.selfie.checklist2',
      'primer.selfie.checklist4',
      'primer.selfie.checklist5',
    ]);
    expect('primer.selfie.checklist1' in DEFAULT_TEXTS).toBe(false);
    expect(NOT_SHOWN['primer.selfie.checklist1']).toBeTruthy();
  });

  it('stands its picture on the page with no tinted box round it', () => {
    expect(READY_LIVENESS.heroBoxed).toBeFalsy();
    const step = read('screens/LivenessStep.tsx');
    expect(step).toContain('hero={<GesturePreview passive={passive} />}');
    const primer = read('components/ReadyPrimer.tsx');
    expect(primer).toContain('const boxed = !hero || content.heroBoxed === true;');
  });

  it('is called "Face check" in the step heading', () => {
    expect(DEFAULT_TEXTS['presence.title']).toBe('Face check');
  });
});

describe('the document intro', () => {
  it('leaves out the stock title and sentence: the step heading says it', () => {
    const words = primerWords(documentReady('Passport'), defaultText);
    expect(words.title).toBe('');
    expect(words.body).toBe('');
  });

  it("names the document in the list, and in a workflow's own words", () => {
    const words = primerWords(documentReady('Passport'), defaultText);
    expect(words.checklist.map((row) => row.label)).toEqual([
      'Have your Passport with you',
      'Find even lighting, avoid glare',
      'Takes a few seconds',
    ]);
    const t = createTextFn({ en: { 'primer.document.title': 'Get your {document} ready' } });
    expect(primerWords(documentReady('National ID Card'), t).title).toBe('Get your National ID Card ready');
  });

  it('keeps its picture in the tinted box', () => {
    expect(READY_DOCUMENT.heroBoxed).toBe(true);
    expect(documentReady('Passport').heroBoxed).toBe(true);
    expect(read('screens/DocumentCaptureStep.tsx')).toMatch(/content=\{documentReady\(documentName\)\}[\s\S]*<DocumentScanPreview/);
  });

  it('calls a passport "Passport" in the step: heading, badge and camera hints', () => {
    const step = read('screens/DocumentCaptureStep.tsx');
    expect(step).toContain('const documentName = shortDocumentLabel(selectedIdType ?? null, documentLabel);');
    expect(step).toContain('idTypeLabel={documentName}');
    expect(step).toMatch(/active=\{camera\.perm === 'granted'\}\s*documentLabel=\{documentName\}/);
    expect(read('components/stepHeaderMeta.tsx')).toContain('shortDocumentLabel(selectedIdType, label),');
  });

  it('scans a one-sided document in the same words as the others', () => {
    expect(defaultText('uploadDocument.title.capture', { document: 'Passport' })).toBe('Scan Your Passport');
    expect(defaultText('uploadDocument.description.capture', { document: 'Passport' })).toBe(
      'Place your Passport within the frame.',
    );
  });
});

describe('the turn-over prompt', () => {
  it('moves on by itself: there is no button', () => {
    const prompt = read('components/viewfinder/TurnOverPrompt.tsx');
    expect(prompt).not.toMatch(/Pressable|turned it over|onDone/);
    expect(read('components/viewfinder/ImmersiveOverlay.tsx')).not.toContain('onTurned');
  });
});

// The changed defaults are the contract's own words (the vector file the web
// SDK regenerated), placeholders included.
interface TextVector {
  key: string;
  default: string;
  placeholders?: string[];
}
const vectors = sharedVectors<{ texts: TextVector[] }>('sdk-flutter/test/customisable_texts_vectors.json', {
  texts: [],
});

describeInMonorepo('the new defaults agree with the shared contract', () => {
  const CHANGED = [
    'primer.document.title',
    'primer.document.body',
    'primer.document.checklist1',
    'primer.document.checklist3',
    'uploadDocument.title.capture',
    'uploadDocument.description.capture',
    'presence.title',
  ];

  it.each(CHANGED)('%s', (key) => {
    const vector = vectors.texts.find((v) => v.key === key);
    expect(DEFAULT_TEXTS[key]).toBe(vector?.default);
  });

  it('the primer texts that name the document may use {document}', () => {
    for (const key of ['primer.document.title', 'primer.document.body', 'primer.document.checklist1']) {
      expect(vectors.texts.find((v) => v.key === key)?.placeholders).toContain('document');
    }
  });
});
