import { readFileSync } from 'fs';
import { join } from 'path';

import { UPLOAD_HINT, UPLOAD_HINT_PHOTOS } from '../config/uploadLimits';
import { documentSourceOptions } from '../screens/documentSourceOptions';
import { documentPickerAvailable, documentUploadHint } from '../services/documentPicker';

const sources = { choosePhoto: jest.fn(), takePhoto: jest.fn(), chooseFile: jest.fn() };
const labels = (canChooseFile: boolean): string[] =>
  documentSourceOptions(sources, canChooseFile).map((o) => o.label);

describe('the uploaded row', () => {
  // On a phone 360 wide the actions leave too little for "Uploaded" and the
  // size on one line. A row that cannot wrap runs under the actions.
  it('wraps the status line and keeps the actions out of the text column', () => {
    const src = readFileSync(
      join(__dirname, '..', 'screens/business-documents/DocumentUploadCard.tsx'),
      'utf8',
    );
    expect(src).toContain("flexWrap: 'wrap'");
    expect(src).not.toContain('`· ${kb}`');
    expect(src).toMatch(/<View style=\{\{ flexDirection: 'row' \}\}>\s*<RoundAction/);
  });
});

describe('document sources', () => {
  it('offers the file picker only in an app that has it', () => {
    expect(labels(true)).toEqual(['Photo library', 'Take a photo', 'Choose a file']);
    expect(labels(false)).toEqual(['Photo library', 'Take a photo']);
  });

  it('each option runs its own source', () => {
    const [library, camera, files] = documentSourceOptions(sources, true);
    expect(library?.onPress).toBe(sources.choosePhoto);
    expect(camera?.onPress).toBe(sources.takePhoto);
    expect(files?.onPress).toBe(sources.chooseFile);
  });

  it('reads whether the picker is in this build from Expo', () => {
    expect(documentPickerAvailable(() => ({}))).toBe(true);
    expect(documentPickerAvailable(() => null)).toBe(false);
  });

  it('the hint stops promising a PDF when only photos can be attached', () => {
    expect(documentUploadHint(() => ({}))).toBe(UPLOAD_HINT);
    expect(documentUploadHint(() => null)).toBe(UPLOAD_HINT_PHOTOS);
    expect(UPLOAD_HINT_PHOTOS).not.toContain('PDF');
  });

  it('every document step uses the shared list and hint', () => {
    for (const rel of [
      'screens/ProofOfAddressStep.tsx',
      'screens/SupportingDocumentsStep.tsx',
      'screens/business-documents/DocumentSourceSheet.tsx',
    ]) {
      const src = readFileSync(join(__dirname, '..', rel), 'utf8');
      expect(src).toContain('documentSourceOptions(');
      expect(src).not.toContain("label: 'Choose a file'");
    }
    for (const rel of [
      'screens/ProofOfAddressParts.tsx',
      'screens/BusinessDocumentSlot.tsx',
      'screens/business-documents/DocumentUploadCard.tsx',
    ]) {
      expect(readFileSync(join(__dirname, '..', rel), 'utf8')).not.toMatch(/\bUPLOAD_HINT\b/);
    }
  });
});
