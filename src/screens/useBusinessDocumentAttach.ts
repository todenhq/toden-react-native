import { useCallback, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import type { ResolvedBusinessDocumentType } from '../config/businessSteps';
import { isAcceptedPoaMimeType, POA_ACCEPTED_MIME_TYPES } from '../config/proofOfAddress';
import { isPdfMime, uploadSizeError } from '../config/uploadLimits';
import { loadDocumentPicker } from '../services/documentPicker';
import { documentPhotoPreparers } from '../services/mediaCompress';
import { asJpegName, preparePickedPhoto, type PickedPhoto } from '../services/pickedPhoto';
import type { CapturedPhoto } from '../components/viewfinder/photoMode';

// ---------------------------------------------------------------------------
// Getting a company document off the device — the business-documents step's
// twin of usePoaAttach (extracted from BusinessDocumentsStep, 200-line rule).
// Three sources, one shape handed to the step's uploader. A photo is resized
// and re-encoded FIRST and the shared caps are judged on what is sent (a
// camera still is often over 5 MB as taken; see services/pickedPhoto). A PDF
// is judged as chosen (images 5 MB, PDFs 15 MB). The uploader gets the
// prepared file and must not re-encode it.
// ---------------------------------------------------------------------------

/**
 * The minimum a slot must carry for this hook: it reads the label for error
 * copy and hands the slot straight back to the caller's uploader. Generalised
 * so the supporting-documents step shares this picker rather than owning a
 * second copy of three file sources and their size/MIME rules.
 */
export interface AttachableSlot {
  key: string;
  label: string;
}

export type AttachBusinessDocument<S extends AttachableSlot = ResolvedBusinessDocumentType> = (
  slot: S,
  uri: string,
  mimeType: string | undefined,
  name: string,
  /** Size in bytes, when the picker reports it. */
  size?: number,
) => Promise<void>;

type Pick<S extends AttachableSlot> = (slot: S) => Promise<void>;

export function useBusinessDocumentAttach<S extends AttachableSlot = ResolvedBusinessDocumentType>(
  attach: AttachBusinessDocument<S>,
  setError: (message: string) => void,
  /** The slot whose photo is being shrunk (null when done), so the card can
   *  show it is busy: a 48 MP still takes a moment. */
  onPreparing?: (slot: S | null) => void,
): {
  takePhoto: Pick<S>;
  choosePhoto: Pick<S>;
  chooseFile: Pick<S>;
  /** The slot the SDK's camera was last opened for, or null. */
  cameraSlot: S | null;
  /** Spread onto the step's PhotoCamera (its title is the slot's label). */
  photoCamera: { open: boolean; onDismiss: () => void; onPhoto: (photo: CapturedPhoto) => void };
} {
  const tooLarge = useCallback(
    (mime: string | undefined, size: number | undefined): boolean => {
      const message = uploadSizeError(mime, size);
      if (message) setError(message);
      return message !== null;
    },
    [setError],
  );

  // Shrink a photo, then judge it. The slot key names it: camera and library
  // assets carry generated names, the slot key says what the file IS.
  const attachPhoto = useCallback(
    async (slot: S, photo: PickedPhoto, name: string): Promise<void> => {
      onPreparing?.(slot);
      const prepared = await preparePickedPhoto(photo, documentPhotoPreparers).finally(() =>
        onPreparing?.(null),
      );
      if (tooLarge(prepared.mimeType, prepared.size)) return;
      await attach(slot, prepared.uri, prepared.mimeType, name, prepared.size);
    },
    [attach, onPreparing, tooLarge],
  );

  // The SDK's own camera (PhotoCamera), rendered by the step for this slot; it
  // owns the permission ask. The slot outlives `open`, so the title holds while
  // the camera fades and the photo still finds its slot after it has started
  // to close.
  const [cameraSlot, setCameraSlot] = useState<S | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraSlotRef = useRef<S | null>(null);
  const takePhoto = useCallback<Pick<S>>(async (slot) => {
    cameraSlotRef.current = slot;
    setCameraSlot(slot);
    setCameraOpen(true);
  }, []);
  const dismissCamera = useCallback(() => setCameraOpen(false), []);
  const cameraPhoto = useCallback(
    (photo: CapturedPhoto) => {
      const slot = cameraSlotRef.current;
      if (slot) void attachPhoto(slot, photo, `${slot.key}.jpg`);
    },
    [attachPhoto],
  );

  const choosePhoto = useCallback<Pick<S>>(
    async (slot) => {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset) await attachPhoto(slot, asset, `${slot.key}.jpg`);
    },
    [attachPhoto],
  );

  const chooseFile = useCallback<Pick<S>>(
    async (slot) => {
      const picker = loadDocumentPicker();
      if (!picker) {
        setError('Choosing a file is not available in this app. Please photograph the document.');
        return;
      }
      const result = await picker.getDocumentAsync({
        type: [...POA_ACCEPTED_MIME_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset) return;
      // The picker's `type` filter is advisory on some platforms, so what came
      // back is re-checked rather than trusted.
      if (!isAcceptedPoaMimeType(asset.mimeType)) {
        setError('Please choose a PDF, JPG or PNG file.');
        return;
      }
      // An image from Files is shrunk like any photo; a PDF goes as chosen.
      if (!isPdfMime(asset.mimeType)) {
        const photo = { uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.size };
        await attachPhoto(slot, photo, asJpegName(asset.name ?? slot.key));
        return;
      }
      if (tooLarge(asset.mimeType, asset.size)) return;
      await attach(slot, asset.uri, asset.mimeType, asset.name ?? slot.key, asset.size);
    },
    [attach, attachPhoto, setError, tooLarge],
  );

  return {
    takePhoto,
    choosePhoto,
    chooseFile,
    cameraSlot,
    photoCamera: { open: cameraOpen, onDismiss: dismissCamera, onPhoto: cameraPhoto },
  };
}
