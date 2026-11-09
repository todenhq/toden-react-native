// ---------------------------------------------------------------------------
// A photo off the camera or the photo library, made fit to upload.
//
// The size cap is judged on what is SENT, not on what the picker handed back.
// A modern phone camera writes 12-48 MP stills of several MB (an iPhone 16 Pro
// Max often 8-20 MB), so judging the picker's file refused every camera photo
// with "Image is too large" before it was ever shrunk. Flutter never hit this:
// image_picker re-encodes at `imageQuality: 90` before its size check.
//
// So a photo is first resized and re-encoded as the document still is
// (`compressDocumentImage`: JPEG q0.9, longest edge at most 2000 px), and the
// cap is checked on the result. The cap stays as the backstop for a photo that
// cannot be shrunk; a PDF never comes through here.
//
// Pure (the compressor and the size reader are handed in) so it is testable
// without the native modules.
// ---------------------------------------------------------------------------

/** The parts of a picker asset this needs. */
export interface PickedPhoto {
  uri: string;
  mimeType?: string | null;
  /** Size in bytes, when the picker reports it. */
  fileSize?: number | null;
}

/** What goes to the size check and the uploader. */
export interface PreparedPhoto {
  uri: string;
  mimeType: string;
  /** Size in bytes, or undefined when it cannot be read. */
  size: number | undefined;
}

export interface PhotoPreparers {
  /** Resize + re-encode as JPEG, answering the new file's URI. */
  compress: (uri: string) => Promise<string>;
  /** The file's size in bytes, or null when unknown. */
  sizeOf: (uri: string) => number | null;
}

export async function preparePickedPhoto(
  photo: PickedPhoto,
  { compress, sizeOf }: PhotoPreparers,
): Promise<PreparedPhoto> {
  try {
    const uri = await compress(photo.uri);
    let size: number | undefined;
    try {
      size = sizeOf(uri) ?? undefined;
    } catch {
      size = undefined;
    }
    return { uri, mimeType: 'image/jpeg', size };
  } catch {
    // Could not re-encode: send the original as it was, judged at its own
    // size, so the cap still refuses a file the server would.
    return {
      uri: photo.uri,
      mimeType: photo.mimeType ?? 'image/jpeg',
      size: photo.fileSize ?? undefined,
    };
  }
}

/** `name` with its extension swapped for `.jpg`, as the bytes now are. */
export function asJpegName(name: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.jpg`;
}
