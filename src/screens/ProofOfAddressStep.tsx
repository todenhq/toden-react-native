import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { spacing } from '../config/theme';
import { useFlowState, useVerificationConfig, useVerificationStore, useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { UiButton } from '../components/UiButton';
import { MediaSourceSheet } from '../components/MediaSourceSheet';
import { PhotoCamera } from '../components/PhotoCamera';
import { PHOTO_COPY } from '../components/viewfinder/photoMode';
import { configScope, isScopedBusiness } from '../lib/scope';
import { withRetry } from '../services/retry';
import { uploadFailureMessage } from '../services/uploadErrors';
import { poaDocumentTypes, poaTypeLabel } from '../config/proofOfAddress';
import { usePoaAttach, type PoaPick } from './usePoaAttach';
import { documentSourceOptions } from './documentSourceOptions';
import { documentPickerAvailable } from '../services/documentPicker';
import { AddressCountryControl } from './AddressCountryControl';
import { poaCountryFor } from '../store/derive';
import { businessKey } from '../i18n/business-variants';
import { PoaAcceptedDocuments } from './PoaAcceptedDocuments';
import { PoaRequirements } from './PoaRequirements';
import { PoaUploadActions } from './ProofOfAddressParts';
import { PoaUploadedCard } from './PoaUploadedCard';
import type { PoaDocumentType } from '../types/workflow';
import { useText } from '../i18n/useText';

// ---------------------------------------------------------------------------
// Proof of Address: the applicant says which country the document is from,
// picks its kind, and takes a photo or uploads a file. The server reads it
// asynchronously, recognises which document within the kind it is, and checks
// the name, address and date. The SDK only collects it. Mirrors the web SDK's
// steps/ProofOfAddressStep.tsx; the header (StepView's sheet) carries the
// title and what the document must show.
// ---------------------------------------------------------------------------

export function ProofOfAddressStep(): React.ReactElement {
  const config = useVerificationConfig();
  const t = useText();
  const store = useVerificationStore();
  const { colors } = useTheme();
  const mediaId = useFlowState((s) => s.mediaIds.proofOfAddress);
  const fileName = useFlowState((s) => s.poaFileName);
  const storedType = useFlowState((s) => s.poaDocumentType);
  const scoped = configScope(config) === 'address';
  const poa = config.proofOfAddress;

  // Where the document is from, on every scope; Continue holds while null.
  // Outside the address scope it starts from the ID's country and the
  // applicant can change it. See lib/poa-country-gate.ts.
  const poaCountry = useFlowState(poaCountryFor);
  // Per-country overrides narrow the kinds; a kind picked before the country
  // changed may not be offered there.
  const types = poaDocumentTypes(poa, poaCountry);
  const selectedType: PoaDocumentType = storedType && types.includes(storedType) ? storedType : types[0]!;
  const otherLabel = poa?.otherLabel?.trim() || null;
  const labelFor = (type: PoaDocumentType): string => poaTypeLabel(type, poa, t);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The picked file, kept for the uploaded card's page.
  const [preview, setPreview] = useState<{ uri: string; isPdf: boolean } | null>(null);

  const upload = useCallback(
    async ({ uri, mimeType, name }: PoaPick) => {
      setBusy(true);
      setError(null);
      const isPdf = (mimeType ?? '').toLowerCase().startsWith('application/pdf');
      try {
        // A photo arrives already resized and re-encoded by usePoaAttach (it is
        // judged against the size cap on that); a PDF is passed through
        // untouched: re-encoding it would destroy the text the server reads.
        const id = await withRetry(() =>
          store.getState().api.upload({ uri, type: mimeType, name }, 'proof_of_address'),
        );
        setPreview({ uri, isPdf });
        store.getState().setProofOfAddress(id, selectedType, name);
      } catch (e) {
        setError(uploadFailureMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [selectedType, store],
  );

  const { pick, sheetOpen, closeSheet, choosePhoto, takePhoto, chooseFile, photoCamera } = usePoaAttach(
    upload,
    setError,
    setBusy,
  );
  const pickerAvailable = documentPickerAvailable();
  // "Upload a file" asks where from (the photo library or the files app); an
  // app without a file picker has only the library, so it opens straight on it.
  const chooseUpload = (): void => {
    if (pickerAvailable) pick();
    else void choosePhoto();
  };
  const capture = poa?.capture ?? 'both';

  const remove = useCallback(() => {
    setPreview(null);
    setError(null);
    store.getState().clearProofOfAddress();
  }, [store]);

  const uploaded = Boolean(mediaId) && !busy;

  const proceed = (): void => {
    // Pinned for the submission, which sends it as the document's country.
    if (poaCountry) store.getState().setPoaCountry(poaCountry);
    store.getState().nextStep();
  };

  return (
    <View style={{ gap: spacing.md }}>
      <MediaSourceSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={t('proofOfAddress.action.file')}
        // No camera here: taking a photo is its own tile, or the workflow
        // asked for a file.
        options={documentSourceOptions(
          {
            choosePhoto: () => void choosePhoto(),
            takePhoto: () => void takePhoto(),
            chooseFile: () => void chooseFile(),
          },
          pickerAvailable,
          false,
        )}
      />

      {/* "Take a photo": the SDK's own camera, without the scan. Its Upload is
          the step's own, and is left out when the workflow wants the camera. */}
      <PhotoCamera
        {...photoCamera}
        title={t('proofOfAddress.title')}
        instruction={PHOTO_COPY.fitDocument}
        onUpload={capture === 'camera' ? null : chooseUpload}
      />

      {/* Every scope: where the document is from. On the address scope it is
          the flow's declared country; elsewhere the document's own. */}
      <AddressCountryControl
        value={poaCountry}
        label={t(businessKey('proofOfAddress.country.residence', isScopedBusiness(config)))}
        onPick={(code) =>
          scoped ? store.getState().setCountry(code) : store.getState().setPoaCountry(code)
        }
      />

      {types.length > 1 ? (
        <PoaAcceptedDocuments
          kinds={types}
          value={selectedType}
          disabled={busy || uploaded}
          onChange={(kind) => store.getState().setPoaDocumentType(kind)}
          poa={poa}
          labelFor={labelFor}
          otherLabel={otherLabel}
        />
      ) : null}

      <PoaRequirements kinds={types} selected={selectedType} poa={poa} labelFor={labelFor} otherLabel={otherLabel} />

      {uploaded ? (
        <PoaUploadedCard
          preview={preview}
          fileName={fileName}
          typeLabel={labelFor(selectedType)}
          country={poaCountry}
          onReplace={capture === 'camera' ? () => void takePhoto() : chooseUpload}
          onRemove={remove}
        />
      ) : (
        <PoaUploadActions
          capture={capture}
          uploading={busy}
          fileHint={pickerAvailable ? t('proofOfAddress.action.fileHint') : 'A photo from your library'}
          onCamera={() => void takePhoto()}
          onFile={chooseUpload}
        />
      )}

      {error ? (
        <UiText variant="bodySmall" color={colors.error}>
          {error}
        </UiText>
      ) : null}

      {/* Continue arrives with the document: before it, the tiles are the action. */}
      {uploaded ? (
        <UiButton label={t('common.continue')} disabled={!mediaId || busy || !poaCountry} onPress={proceed} />
      ) : null}
    </View>
  );
}
