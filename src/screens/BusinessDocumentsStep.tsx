import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { spacing } from '../config/theme';
import { useFlowState, useVerificationConfig, useVerificationStore } from '../components/runtime';
import { UiButton } from '../components/UiButton';
import { useText } from '../i18n/useText';
import {
  businessDocumentGroups,
  canLeaveGroup,
  firstOpenGroupIndex,
  groupButtonLabel,
} from '../config/businessDocumentGroups';
import { GroupStack } from './business-documents/GroupStack';
import { DocumentSourceSheet } from './business-documents/DocumentSourceSheet';
import { PhotoCamera } from '../components/PhotoCamera';
import { PHOTO_COPY } from '../components/viewfinder/photoMode';
import { documentPickerAvailable } from '../services/documentPicker';
import { BUSINESS_DOCUMENTS_COPY as COPY } from './business-documents/copy';
import { useGroupUpload, type GroupSlot } from './business-documents/useGroupUpload';

// ---------------------------------------------------------------------------
// Supporting company documents, one GROUP at a time (Didit's model): the
// documents an organisation ticks in one group are alternatives, so the
// applicant uploads one per group and never says which it is (the server
// recognises it). The groups are a vertical carousel: the open group's card in
// front, the next group's card tucked behind it at the top and the previous
// group's at the bottom (press it to change it). Continue brings the next card
// down into the middle (Back brings the previous one up), and the last group
// moves on through the flow.
// The button reads Next between groups and Continue on the last; an optional
// group can be skipped (the button reads Skip while it holds nothing). Back walks the groups before leaving the step: the open group
// lives in the store (`businessDocumentGroup`) because Back is the sheet's,
// and previousStep reads it.
//
// The registry says a business exists; these are what say the applicant holds
// its paperwork. The server reads each one and cross-checks it against the
// registry record, a soft result that never fails the verification.
// Mirrors the web SDK's BusinessDocumentsStep.
// ---------------------------------------------------------------------------

export function BusinessDocumentsStep(): React.ReactElement {
  const config = useVerificationConfig();
  const t = useText();
  const store = useVerificationStore();
  const docs = useGroupUpload();
  const [picking, setPicking] = useState<GroupSlot | null>(null);
  // The sheet opened from the camera's Upload leaves the camera out.
  const [sheetFromCamera, setSheetFromCamera] = useState(false);
  const pick = (slot: GroupSlot): void => {
    setSheetFromCamera(false);
    setPicking(slot);
  };
  const uploadInstead = (slot: GroupSlot): void => {
    if (!documentPickerAvailable()) {
      void docs.choosePhoto(slot);
      return;
    }
    setSheetFromCamera(true);
    setPicking(slot);
  };

  const groups = useMemo(() => businessDocumentGroups(config.business), [config.business]);
  // Where the step opens, worked out once per visit.
  const [initial] = useState(() => firstOpenGroupIndex(groups, docs.uploads));
  const stored = useFlowState((s) => s.businessDocumentGroup);
  useEffect(() => {
    store.getState().setBusinessDocumentGroup(initial);
    return () => store.getState().setBusinessDocumentGroup(null);
  }, [store, initial]);

  const index = Math.min(stored ?? initial, Math.max(groups.length - 1, 0));
  const group = groups[index];
  const canContinue = group ? canLeaveGroup(group, docs.uploads) : true;
  const button = group ? groupButtonLabel(group, docs.uploads, index, groups.length) : 'continue';
  const skipping = button === 'skip';

  const open = (next: number): void => {
    docs.clearError();
    store.getState().setBusinessDocumentGroup(next);
  };

  const handleContinue = (): void => {
    if (!canContinue || docs.uploading !== null) return;
    if (index < groups.length - 1) {
      open(index + 1);
      return;
    }
    store.getState().nextStep();
  };

  return (
    <View>
      {group ? (
        <View style={{ marginBottom: spacing.lg }}>
          <GroupStack groups={groups} active={index} docs={docs} onOpen={open} onPick={pick} />
        </View>
      ) : null}

      <UiButton
        label={skipping ? COPY.skip : button === 'next' ? COPY.nextButton : t('common.continue')}
        variant={skipping ? 'outline' : 'primary'}
        onPress={handleContinue}
        disabled={!canContinue || docs.uploading !== null}
      />

      <DocumentSourceSheet
        slot={picking}
        onClose={() => setPicking(null)}
        takePhoto={docs.takePhoto}
        choosePhoto={docs.choosePhoto}
        chooseFile={docs.chooseFile}
        withCamera={!sheetFromCamera}
      />

      {/* "Take a photo": the SDK's own camera, without the scan. Its Upload
          opens the same sheet without the camera, or the library when there
          is no file picker. */}
      <PhotoCamera
        {...docs.photoCamera}
        title={docs.cameraSlot?.label ?? ''}
        instruction={PHOTO_COPY.fitDocument}
        onUpload={docs.cameraSlot ? () => uploadInstead(docs.cameraSlot!) : null}
      />
    </View>
  );
}
