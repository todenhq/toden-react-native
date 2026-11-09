import React from 'react';

import { MediaSourceSheet } from '../../components/MediaSourceSheet';
import { documentPickerAvailable } from '../../services/documentPicker';
import { documentSourceOptions } from '../documentSourceOptions';
import type { GroupSlot } from './useGroupUpload';

// THE SAME sheet as the Proof of Address step: identical title, options, icons
// and captions, so uploading a document feels the same everywhere in the flow.
// Pressing the upload area (or Replace) opens it.

export function DocumentSourceSheet({
  slot,
  onClose,
  takePhoto,
  choosePhoto,
  chooseFile,
  withCamera = true,
}: {
  /** The group being picked for, or null when the sheet is closed. */
  slot: GroupSlot | null;
  /** False when opened from the camera's own Upload: they have just left it. */
  withCamera?: boolean;
  onClose: () => void;
  takePhoto: (slot: GroupSlot) => Promise<void>;
  choosePhoto: (slot: GroupSlot) => Promise<void>;
  chooseFile: (slot: GroupSlot) => Promise<void>;
}): React.ReactElement {
  const run = (pick: (slot: GroupSlot) => Promise<void>) => () => {
    const picking = slot;
    onClose();
    if (picking) void pick(picking);
  };
  return (
    <MediaSourceSheet
      open={slot !== null}
      title="Upload your document"
      onClose={onClose}
      options={documentSourceOptions(
        { choosePhoto: run(choosePhoto), takePhoto: run(takePhoto), chooseFile: run(chooseFile) },
        documentPickerAvailable(),
        withCamera,
      )}
    />
  );
}
