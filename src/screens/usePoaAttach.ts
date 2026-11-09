import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { isAcceptedPoaMimeType, POA_ACCEPTED_MIME_TYPES } from '../config/proofOfAddress';
import { isPdfMime, uploadSizeError } from '../config/uploadLimits';
import { loadDocumentPicker } from '../services/documentPicker';
import { documentPhotoPreparers } from '../services/mediaCompress';
import { asJpegName, preparePickedPhoto, type PickedPhoto } from '../services/pickedPhoto';
import type { CapturedPhoto } from '../components/viewfinder/photoMode';

// ---------------------------------------------------------------------------
// Getting a proof-of-address document off the device.
//
// The step offers it as the workflow's `proofOfAddress.capture` says: "Take a
// photo" opens the SDK's own camera (PhotoCamera, the full-screen document
// camera without the scan) straight away, and "Upload a file" asks WHERE the
// file is (the photo library, or the files app when `expo-document-picker` is
// in the build) in the SDK's own source sheet.
// ---------------------------------------------------------------------------

/** What the picker handed back, so the screen can preview it. */
export interface PoaPick {
  uri: string;
  mimeType: string | undefined;
  name: string;
}

type UploadFn = (pick: PoaPick) => Promise<void>;

export function usePoaAttach(
  upload: UploadFn,
  setError: (message: string) => void,
  /** True while a photo is being shrunk, so the step can show it is busy. */
  onPreparing?: (preparing: boolean) => void,
): {
  pick: () => void;
  sheetOpen: boolean;
  closeSheet: () => void;
  choosePhoto: () => Promise<void>;
  takePhoto: () => Promise<void>;
  chooseFile: () => Promise<void>;
  /** Spread onto the step's PhotoCamera. */
  photoCamera: { open: boolean; onDismiss: () => void; onPhoto: (photo: CapturedPhoto) => void };
} {
  // A PDF is judged against the shared caps as chosen (15 MB). A photo is
  // resized and re-encoded FIRST and judged on what is sent (5 MB): a camera
  // still is often over 5 MB as taken (see services/pickedPhoto). The
  // uploader gets the prepared photo and must not re-encode it.
  const tooLarge = useCallback(
    (mime: string | undefined, size: number | undefined): boolean => {
      const message = uploadSizeError(mime, size);
      if (message) setError(message);
      return message !== null;
    },
    [setError],
  );

  const uploadPhoto = useCallback(
    async (photo: PickedPhoto, name: string): Promise<void> => {
      onPreparing?.(true);
      const prepared = await preparePickedPhoto(photo, documentPhotoPreparers).finally(() =>
        onPreparing?.(false),
      );
      if (tooLarge(prepared.mimeType, prepared.size)) return;
      await upload({
        uri: prepared.uri,
        mimeType: prepared.mimeType,
        name: asJpegName(name),
      });
    },
    [onPreparing, tooLarge, upload],
  );

  // The SDK's own camera, rendered by the step; it owns the permission ask.
  const [cameraOpen, setCameraOpen] = useState(false);
  const takePhoto = useCallback(async () => setCameraOpen(true), []);
  const dismissCamera = useCallback(() => setCameraOpen(false), []);
  const cameraPhoto = useCallback(
    (photo: CapturedPhoto) => void uploadPhoto(photo, 'proof-of-address.jpg'),
    [uploadPhoto],
  );

  const choosePhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) await uploadPhoto(asset, asset.fileName ?? 'proof-of-address.jpg');
  }, [uploadPhoto]);

  const chooseFile = useCallback(async () => {
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
      await uploadPhoto(photo, asset.name ?? 'proof-of-address.jpg');
      return;
    }
    if (tooLarge(asset.mimeType, asset.size)) return;
    await upload({
      uri: asset.uri,
      mimeType: asset.mimeType,
      name: asset.name ?? 'proof-of-address',
    });
  }, [setError, tooLarge, upload, uploadPhoto]);

  // The "where is it?" question is the SDK's own sheet now, not
  // ActionSheetIOS / Alert — both were stock OS dialogs dropped into the
  // middle of a branded flow (and the Android alert didn't even read as a
  // chooser). The hook only owns the STATE; the screen renders the
  // MediaSourceSheet, because a hook can't render.
  const [sheetOpen, setSheetOpen] = useState(false);
  const pick = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return {
    pick,
    sheetOpen,
    closeSheet,
    choosePhoto,
    takePhoto,
    chooseFile,
    photoCamera: { open: cameraOpen, onDismiss: dismissCamera, onPhoto: cameraPhoto },
  };
}
