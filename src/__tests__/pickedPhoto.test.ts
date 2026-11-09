import { IMAGE_MAX_BYTES, uploadSizeError } from '../config/uploadLimits';
import { asJpegName, preparePickedPhoto } from '../services/pickedPhoto';

// ─── A camera photo is shrunk BEFORE the size cap judges it ─────────────────
//
// Regression: an iPhone 16 Pro Max camera still (12-48 MP, several MB, often
// HEIC) was refused with "Image is too large (max 5 MB)." because the cap was
// checked on the picker's file, before compressDocumentImage ever ran.

const CAMERA_STILL = { uri: 'file:///camera/IMG_0001.HEIC', mimeType: 'image/heic', fileSize: 14 * 1024 * 1024 };

describe('preparePickedPhoto', () => {
  it('judges the re-encoded JPEG, not the camera original', async () => {
    const compress = jest.fn(async () => 'file:///cache/shrunk.jpg');
    const prepared = await preparePickedPhoto(CAMERA_STILL, { compress, sizeOf: () => 900 * 1024 });

    expect(compress).toHaveBeenCalledWith(CAMERA_STILL.uri);
    expect(prepared).toEqual({ uri: 'file:///cache/shrunk.jpg', mimeType: 'image/jpeg', size: 900 * 1024 });
    expect(uploadSizeError(CAMERA_STILL.mimeType, CAMERA_STILL.fileSize)).not.toBeNull();
    expect(uploadSizeError(prepared.mimeType, prepared.size)).toBeNull();
  });

  it('keeps the cap as a backstop when the shrunk file is still too big', async () => {
    const prepared = await preparePickedPhoto(CAMERA_STILL, {
      compress: async () => 'file:///cache/shrunk.jpg',
      sizeOf: () => IMAGE_MAX_BYTES + 1,
    });
    expect(uploadSizeError(prepared.mimeType, prepared.size)).toBe('Image is too large (max 5 MB).');
  });

  it('leaves the size unknown when it cannot be read, so the server judges it', async () => {
    const throwing = await preparePickedPhoto(CAMERA_STILL, {
      compress: async () => 'file:///cache/shrunk.jpg',
      sizeOf: () => {
        throw new Error('no file system');
      },
    });
    const missing = await preparePickedPhoto(CAMERA_STILL, {
      compress: async () => 'file:///cache/shrunk.jpg',
      sizeOf: () => null,
    });
    expect(throwing.size).toBeUndefined();
    expect(missing.size).toBeUndefined();
  });

  it('falls back to the original, judged at its own size, when re-encoding fails', async () => {
    const prepared = await preparePickedPhoto(CAMERA_STILL, {
      compress: async () => {
        throw new Error('decode failed');
      },
      sizeOf: () => 1,
    });
    expect(prepared).toEqual({ uri: CAMERA_STILL.uri, mimeType: 'image/heic', size: CAMERA_STILL.fileSize });
    expect(uploadSizeError(prepared.mimeType, prepared.size)).toBe('Image is too large (max 5 MB).');
  });
});

describe('asJpegName', () => {
  it('names the re-encoded bytes as a JPEG', () => {
    expect(asJpegName('bank-letter.png')).toBe('bank-letter.jpg');
    expect(asJpegName('scan.final.webp')).toBe('scan.final.jpg');
    expect(asJpegName('utility_bill')).toBe('utility_bill.jpg');
  });
});
