import { readFileSync } from 'fs';
import { join } from 'path';

import { DOCUMENT_IMAGE_QUALITY, DOCUMENT_MAX_DIMENSION, DOCUMENT_MIN_WIDTH } from '../config/captureSettings';
import { documentStillPlan, resizeToLimit } from '../lib/documentStill';

// The server reads a card's barcode from the document photo. A Nigerian
// driver's licence stopped decoding from web captures and its number fell to a
// vision model, so the photo keeps the camera's detail and is compressed once.

describe('a document photo sharp enough for its barcode', () => {
  it('keeps the web SDK\'s size limit and quality', () => {
    expect(DOCUMENT_MAX_DIMENSION).toBe(2600);
    expect(DOCUMENT_IMAGE_QUALITY).toBe(0.95);
    expect(DOCUMENT_MAX_DIMENSION).toBeGreaterThan(DOCUMENT_MIN_WIDTH);
  });

  it('leaves a picture inside the limit at the size the crop gave it', () => {
    expect(resizeToLimit({ width: 2600, height: 1640 })).toBeNull();
    expect(resizeToLimit({ width: 1900, height: 1200 })).toBeNull();
  });

  it('brings a larger one inside the limit by its longer side', () => {
    expect(resizeToLimit({ width: 3800, height: 2400 })).toEqual({ width: 2600 });
    expect(resizeToLimit({ width: 2400, height: 3800 })).toEqual({ height: 2600 });
  });
});

describe('a document photo compressed once', () => {
  it('uploads the crop as it was written when it is inside the limit', () => {
    expect(documentStillPlan({ width: 2400, height: 1510 }, true)).toEqual({ encode: false, resize: null });
  });

  it('encodes what did not come from the crop: a photo picked from the device, a crop that failed', () => {
    expect(documentStillPlan({ width: 2400, height: 1510 }, false)).toEqual({ encode: true, resize: null });
    expect(documentStillPlan({ width: 4032, height: 3024 }, false)).toEqual({ encode: true, resize: { width: 2600 } });
  });

  it('still shrinks a crop that is somehow over the limit', () => {
    expect(documentStillPlan({ width: 3000, height: 1900 }, true)).toEqual({ encode: true, resize: { width: 2600 } });
  });

  it('encodes a picture whose size cannot be read, without resizing it', () => {
    expect(documentStillPlan(null, true)).toEqual({ encode: true, resize: null });
  });

  it('is how the camera photo is written: cropped and sized in one pass, then left alone', () => {
    const media = readFileSync(join(__dirname, '..', 'services', 'mediaCompress.ts'), 'utf8');
    // The crop brings the picture inside the limit itself, at the document quality.
    expect(media).toContain('resize ? [{ crop }, { resize }] : [{ crop }],');
    expect(media).toContain('{ compress: DOCUMENT_IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG },');
    expect(media).toContain('if (!plan.encode) return uri;');
    const step = readFileSync(join(__dirname, '..', 'screens', 'DocumentCaptureStep.tsx'), 'utf8');
    // Only a crop that worked counts as written: a failed one is the raw photo.
    expect(step).toContain("await storeCapture(upright, 'camera', videoPath, carded !== rawUri);");
    expect(step).toContain('await compressDocumentImage(rawUri, { fromCrop });');
  });
});
