import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { isAcceptedAddressPhotoMimeType } from '../config/addressCollection';
import { IMAGE_MAX_BYTES } from '../config/uploadLimits';
import { documentPhotoPreparers } from '../services/mediaCompress';
import { asJpegName, preparePickedPhoto, type PickedPhoto } from '../services/pickedPhoto';
import type { CapturedPhoto } from '../components/viewfinder/photoMode';

// ---------------------------------------------------------------------------
// Getting the door photo off the device — the address step's slim sibling of
// usePoaAttach. Camera (the SDK's own PhotoCamera) or photo library only: the
// door photo is a PICTURE of a place, so there is no PDF/file case, and each
// pick closes the source sheet before the picker opens. The photo is resized and re-encoded FIRST and the
// 5 MB cap judged on what is sent: a camera still is often over 5 MB as taken
// (see services/pickedPhoto). The uploader must not re-encode it.
// ---------------------------------------------------------------------------

/** What the picker handed back, so the screen can preview it. */
export interface AddressPhotoPick {
  uri: string;
  mimeType: string | undefined;
  name: string;
}

type UploadFn = (pick: AddressPhotoPick) => Promise<void>;

export function useAddressPhotoAttach(
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
  /** Spread onto the step's PhotoCamera. */
  photoCamera: { open: boolean; onDismiss: () => void; onPhoto: (photo: CapturedPhoto) => void };
} {
  const [sheetOpen, setSheetOpen] = useState(false);
  const pick = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const accept = useCallback(
    async (asset: (PickedPhoto & { fileName?: string | null }) | undefined, fallbackName: string) => {
      if (!asset) return;
      onPreparing?.(true);
      const prepared = await preparePickedPhoto(asset, documentPhotoPreparers).finally(() =>
        onPreparing?.(false),
      );
      if (typeof prepared.size === 'number' && prepared.size > IMAGE_MAX_BYTES) {
        setError('Photo is too large (max 5 MB).');
        return;
      }
      // The picker's media filter is advisory on some platforms, so what came
      // back is re-checked rather than trusted.
      if (!isAcceptedAddressPhotoMimeType(prepared.mimeType)) {
        setError('Please choose a photo (JPEG, PNG or WebP).');
        return;
      }
      const name = asJpegName(asset.fileName ?? fallbackName);
      await upload({ uri: prepared.uri, mimeType: prepared.mimeType, name });
    },
    [onPreparing, setError, upload],
  );

  // The SDK's own camera, rendered by the step; it owns the permission ask.
  const [cameraOpen, setCameraOpen] = useState(false);
  const takePhoto = useCallback(async () => {
    setSheetOpen(false);
    setCameraOpen(true);
  }, []);
  const dismissCamera = useCallback(() => setCameraOpen(false), []);
  // Named for what it is, as the system camera's nameless photo was.
  const cameraPhoto = useCallback(
    (photo: CapturedPhoto) => void accept({ ...photo, fileName: null }, 'address-photo.jpg'),
    [accept],
  );

  const choosePhoto = useCallback(async () => {
    setSheetOpen(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    await accept(result.canceled ? undefined : result.assets[0], 'address-photo.jpg');
  }, [accept]);

  return {
    pick,
    sheetOpen,
    closeSheet,
    choosePhoto,
    takePhoto,
    photoCamera: { open: cameraOpen, onDismiss: dismissCamera, onPhoto: cameraPhoto },
  };
}
