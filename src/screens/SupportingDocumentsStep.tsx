import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { spacing } from '../config/theme';
import { useFlowState, useVerificationConfig, useVerificationStore, useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { UiButton } from '../components/UiButton';
import { MediaSourceSheet } from '../components/MediaSourceSheet';
import { PhotoCamera } from '../components/PhotoCamera';
import { PHOTO_COPY } from '../components/viewfinder/photoMode';
import { SupportingDocumentCard } from './SupportingDocumentCard';
import { withRetry } from '../services/retry';
import {
  resolveSupportingDocuments,
  verifiedIdsFor,
  type RequestedSupportingDocument,
} from '../config/supportingDocuments';
import { useBusinessDocumentAttach } from './useBusinessDocumentAttach';
import { documentSourceOptions } from './documentSourceOptions';
import { documentPickerAvailable } from '../services/documentPicker';
import { useText } from '../i18n/useText';
import { VerificationApiError } from '../services/api';
import { hasSignature, type SignatureDrawing } from '../lib/signature';
import { displayFileName } from '../lib/display-file-name';
import { GroupEnter, type GroupDirection } from './business-documents/GroupEnter';
import { GroupEdge, TuckedRow } from './business-documents/GroupRow';
import { BUSINESS_DOCUMENTS_COPY as COPY } from './business-documents/copy';

// ---------------------------------------------------------------------------
// Supporting documents — artefacts the organisation keeps ON FILE.
//
// These are NOT the identity evidence this verification is decided on. The
// person has already been checked against the government record by the time
// they reach this screen, so a document that cannot be read costs them
// nothing: the server records it and the verification stands on the lookup.
//
// WHICH documents are asked for depends on the ID they picked (a document may
// exist only because they used a particular ID), so the screen is only in the
// order when that resolution produced something — see store/derive.ts.
//
// Layout mirrors the web SDK's SupportingDocumentCard and the Flutter one 1:1:
// a card per document naming what it is being taken FOR, over the same source
// sheet and the same Continue rule as the business-documents screen.
// ---------------------------------------------------------------------------

const SIGNATURE_EMPTY = 'Please sign in the box first.';
const SIGNATURE_FAILED =
  'Your signature could not be saved. Please check your connection and try again.';

export function SupportingDocumentsStep(): React.ReactElement {
  const config = useVerificationConfig();
  const t = useText();
  const store = useVerificationStore();
  const { colors } = useTheme();
  const uploaded = useFlowState((s) => s.supportingDocuments);
  const selectedCountry = useFlowState((s) => s.selectedCountry);
  const selectedIdType = useFlowState((s) => s.selectedIdType);
  const multiIdSlots = useFlowState((s) => s.multiIdSlots);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [pickingSlot, setPickingSlot] = useState<RequestedSupportingDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which card the message belongs to. A failed upload is about ONE document
  // and reads as noise anywhere else; a picker error belongs to no card and
  // keeps its place under the list.
  const [errorSlot, setErrorSlot] = useState<string | null>(null);

  const slots = useMemo(
    () =>
      resolveSupportingDocuments(
        config.supportingDocuments,
        verifiedIdsFor({
          country: selectedCountry ?? config.country,
          idType: selectedIdType,
          multiIdSlots,
        }),
      ),
    [config.supportingDocuments, config.country, selectedCountry, selectedIdType, multiIdSlots],
  );
  const missing = slots.filter((s) => s.required && !uploaded.some((d) => d.type === s.key));

  const attach = useCallback(
    async (slot: RequestedSupportingDocument, uri: string, mimeType: string | undefined, name: string) => {
      setBusySlot(slot.key);
      setError(null);
      setErrorSlot(null);
      try {
        // A photo arrives already resized and re-encoded by the picker hook
        // (it is judged against the size cap on that); a PDF is untouched.
        const isPdf = (mimeType ?? '').toLowerCase().startsWith('application/pdf');
        const mediaId = await withRetry(() =>
          store.getState().api.upload({ uri, type: mimeType, name }, 'supporting_document'),
        );
        store.getState().setSupportingDocument({
          type: slot.key,
          mediaId,
          fileName: name,
          method: 'uploaded' as const,
          // Seeing the file back is how somebody catches the wrong photo from
          // the camera roll before submitting. A PDF has no preview to show.
          ...(isPdf ? { isPdf: true } : { previewUri: uri }),
        });
      } catch {
        setError(`We could not upload ${slot.label.toLowerCase()}. Please try again.`);
        setErrorSlot(slot.key);
      } finally {
        setBusySlot(null);
      }
    },
    [store],
  );

  const sign = useCallback(
    async (slot: RequestedSupportingDocument, drawing: SignatureDrawing) => {
      setError(null);
      setErrorSlot(null);
      if (!hasSignature(drawing)) {
        setError(SIGNATURE_EMPTY);
        setErrorSlot(slot.key);
        return;
      }
      setBusySlot(slot.key);
      try {
        const mediaId = await withRetry(() => store.getState().api.uploadSignature(drawing));
        store.getState().setSupportingDocument({
          type: slot.key,
          mediaId,
          fileName: slot.label,
          method: 'drawn',
        });
      } catch (err) {
        const empty = err instanceof VerificationApiError && err.code === 'signature_empty';
        setError(empty ? SIGNATURE_EMPTY : SIGNATURE_FAILED);
        setErrorSlot(slot.key);
      } finally {
        setBusySlot(null);
      }
    },
    [store],
  );

  // A picker failure belongs to no card, so it clears the slot the last upload
  // error was pinned to — otherwise it would surface under an unrelated
  // document.
  const reportPickerError = useCallback((message: string | null) => {
    setErrorSlot(null);
    setError(message);
  }, []);

  // The card reads busy while its photo is shrunk, before the upload starts.
  const preparing = useCallback(
    (slot: RequestedSupportingDocument | null) => setBusySlot(slot?.key ?? null),
    [],
  );
  const { takePhoto, choosePhoto, chooseFile, cameraSlot, photoCamera } = useBusinessDocumentAttach(
    attach,
    reportPickerError,
    preparing,
  );
  // The sheet opened from the camera's Upload leaves the camera out: they
  // have just come from it.
  const [sheetFromCamera, setSheetFromCamera] = useState(false);
  const uploadInstead = (target: RequestedSupportingDocument): void => {
    if (!documentPickerAvailable()) {
      void choosePhoto(target);
      return;
    }
    setSheetFromCamera(true);
    setPickingSlot(target);
  };
  const pickWith = (pick: (slot: RequestedSupportingDocument) => Promise<void>) => () => {
    const slot = pickingSlot;
    setPickingSlot(null);
    if (slot) void pick(slot);
  };

  // One document at a time, stacked like the business documents: the open
  // one in front, the next tucked above and the previous below. The open
  // index lives in the store because Back is the sheet's, and previousStep
  // walks it before leaving the step. It opens on the first one still to give.
  const [initial] = useState(() => {
    const first = slots.findIndex((slot) => !uploaded.some((d) => d.type === slot.key));
    return first === -1 ? 0 : first;
  });
  const stored = useFlowState((s) => s.supportingDocumentIndex);
  useEffect(() => {
    store.getState().setSupportingDocumentIndex(initial);
    return () => store.getState().setSupportingDocumentIndex(null);
  }, [store, initial]);
  const index = Math.min(stored ?? initial, Math.max(slots.length - 1, 0));
  const open = (next: number): void => {
    setError(null);
    setErrorSlot(null);
    store.getState().setSupportingDocumentIndex(next);
  };
  // Which way the last move went, so the open card arrives from that side.
  const shown = useRef(index);
  const direction = useRef<GroupDirection>(null);
  if (shown.current !== index) {
    direction.current = index > shown.current ? 'forward' : 'back';
    shown.current = index;
  }
  const slot = slots[index];
  const nextSlot = slots[index + 1];
  const previousSlot = slots[index - 1];
  const last = index >= slots.length - 1;
  const docFor = (key: string) => uploaded.find((d) => d.type === key);
  const provided = slot ? docFor(slot.key) !== undefined : true;

  const handleContinue = (): void => {
    if (busySlot !== null || (slot?.required && !provided)) return;
    if (!last) {
      open(index + 1);
      return;
    }
    if (missing.length > 0) return;
    store.getState().nextStep();
  };

  // What a tucked card says under its title.
  const heldBy = (key: string, label: string): string => {
    const doc = docFor(key);
    if (!doc) return COPY.skipped;
    if (doc.method === 'drawn') return 'Signed on screen';
    return displayFileName(doc.fileName ?? label) ?? COPY.uploaded;
  };

  // A camera document skips the source sheet and opens the camera.
  const pick = (target: RequestedSupportingDocument): void => {
    if (target.capture === 'camera') {
      void takePhoto(target);
      return;
    }
    setSheetFromCamera(false);
    setPickingSlot(target);
  };

  const card = (target: RequestedSupportingDocument, position: number) => {
    const doc = docFor(target.key);
    return (
      <SupportingDocumentCard
        key={target.key}
        position={position}
        total={slots.length}
        label={target.label}
        description={target.description}
        required={target.required}
        reads={target.reads}
        // A restored upload carries no file name; the mediaId says it is there.
        fileName={doc ? (doc.fileName ?? target.label) : null}
        capture={target.capture}
        drawn={doc?.method === 'drawn'}
        onSign={(drawing) => void sign(target, drawing)}
        uploading={busySlot === target.key}
        previewUri={doc?.previewUri ?? null}
        isPdf={doc?.isPdf ?? false}
        error={errorSlot === target.key ? error : null}
        onPick={() => pick(target)}
        onRemove={() => store.getState().removeSupportingDocument(target.key)}
      />
    );
  };

  return (
    <View>
      {slot ? (
        <View style={{ marginBottom: spacing.lg }}>
          <GroupEnter key={`ahead-${index}`} direction={direction.current} fadeOnly>
            {slots[index + 2] ? <GroupEdge side="top" /> : null}
            {nextSlot ? (
              <TuckedRow
                title={nextSlot.label}
                number={index + 2}
                done={docFor(nextSlot.key) !== undefined}
                detail={nextSlot.description ?? (nextSlot.required ? 'Required' : 'Optional')}
              />
            ) : null}
          </GroupEnter>
          {/* In front of both tucked cards (elevation orders siblings on Android). */}
          <GroupEnter key={slot.key} direction={direction.current} style={{ zIndex: 2, elevation: 3 }}>
            {card(slot, index + 1)}
          </GroupEnter>
          <GroupEnter key={`behind-${index}`} direction={direction.current} fadeOnly>
            {previousSlot ? (
              <TuckedRow
                title={previousSlot.label}
                number={index}
                done={docFor(previousSlot.key) !== undefined}
                detail={heldBy(previousSlot.key, previousSlot.label)}
                onOpen={() => open(index - 1)}
              />
            ) : null}
            {slots[index - 2] ? <GroupEdge side="bottom" /> : null}
          </GroupEnter>
        </View>
      ) : null}

      {error && errorSlot === null ? (
        <UiText variant="bodySmall" color={colors.error} style={{ marginBottom: spacing.sm }}>
          {error}
        </UiText>
      ) : null}

      <View style={{ height: spacing.xs }} />
      <UiButton
        label={t(slot && !slot.required && !provided ? 'common.skip' : 'common.continue')}
        onPress={handleContinue}
        disabled={Boolean(slot?.required && !provided) || (last && missing.length > 0) || busySlot !== null}
      />

      {/* THE SAME sheet as Proof of Address and the business documents, so
          uploading a document feels the same everywhere in the flow. */}
      <MediaSourceSheet
        open={pickingSlot !== null}
        title="Upload your document"
        onClose={() => setPickingSlot(null)}
        options={documentSourceOptions(
          {
            choosePhoto: pickWith(choosePhoto),
            takePhoto: pickWith(takePhoto),
            chooseFile: pickWith(chooseFile),
          },
          documentPickerAvailable(),
          // Upload (`file`): what is already on the device, never the camera.
          pickingSlot?.capture !== 'file' && !sheetFromCamera,
        )}
      />

      {/* "Take a photo": the SDK's own camera, without the scan. A camera
          document (`capture: 'camera'`) gets no Upload: the workflow wants it
          photographed now. */}
      <PhotoCamera
        {...photoCamera}
        title={cameraSlot?.label ?? ''}
        instruction={PHOTO_COPY.fitDocument}
        onUpload={cameraSlot && cameraSlot.capture !== 'camera' ? () => uploadInstead(cameraSlot) : null}
      />
    </View>
  );
}
