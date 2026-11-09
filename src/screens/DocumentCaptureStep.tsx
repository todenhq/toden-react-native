import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { cameraBottomInset } from '../components/viewfinder/cameraInsets';

import { spacing } from '../config/theme';
import { ID_TYPES, documentGuideAspect, getScanSides } from '../config/idTypes';
import { withRetry } from '../services/retry';
import { mapToVerificationError, safeReportError } from '../services/errors';
import { compressDocumentImage, compressVideo, cropCardRegion, cropGuideRegion, cropToDocumentCorners, rotateImage } from '../services/mediaCompress';
import { undoDegrees } from '../capture/documentTurn';
import type { CornerFraming } from '../capture/useCornerGate';
import { MAX_VIDEO_BYTES } from '../config/captureSettings';
import type { DocumentCapturePhase } from '../store/verificationStore';
import {
  afterDocumentCapture,
  documentCaptureMethods,
  recordsDocumentAudio,
  type DocumentSideSource,
} from '../config/documentCaptureMethods';
import { useEffectiveCountry, useFlowState, useVerificationConfig, useVerificationStore, useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { UiButton } from '../components/UiButton';
import { useToast } from '../components/toast';
import { UiPulseLoader } from '../components/UiPulseLoader';
import { CameraPhase, type CaptureTurn } from './document/CameraPhase';
import { CameraPermissionView, CameraUnavailableView, CameraPermissionPrimingView } from '../components/CameraPermissionView';
import { ReadyPrimer } from '../components/ReadyPrimer';
import { RequiredDocumentPill } from '../components/RequiredDocumentPill';
import { READY_DOCUMENT } from '../components/readyPrimerContent';
import { DocumentCropper } from '../components/DocumentCropper';
import { DocumentReview } from '../components/DocumentReview';
import { scanMrzFromImage } from '../mrz/textRecognizer';
import { Icon } from '../components/Icon';
import { useDocumentCamera, type DocumentCamera } from './document/useDocumentCamera';
import { useDocumentMicrophone, type DocumentMicrophone } from './document/useDocumentMicrophone';
import { DocumentHandover } from './document/DocumentHandover';
import { UploadPhase } from './document/UploadPhase';
import { CaptureCheckNotice } from './document/CaptureCheckNotice';
import { DocImage } from './document/DocImage';
import { SilentFrontCapture } from './document/SilentFrontCapture';
import { silentCaptureEnabled } from '../lib/silentCapture';
import { useText } from '../i18n/useText';
import { isBusinessFlow } from '../config/business';
import { captureCheckProblems, runCaptureChecks, type CaptureProblem } from '../lib/documentCaptureCheck';
import type { DocumentCaptureCheckRequest, DocumentCaptureSide } from '../services/api';

// Document capture — the RN mirror of the Flutter/web DocumentCaptureStep.
// Phases: front → front-preview → back → review (two-sided); front → review
// (one-sided). Manual shutter (VisionCamera) or gallery upload; each side is
// compressed (OCR-conservative) then eagerly uploaded on Continue with retry.
//
// Which of the two ways in is offered comes from `documentCaptureMethods`
// (allowDocumentScan / allowDocumentUpload). With scanning off, each side is
// UploadPhase instead of the camera, and the camera's hooks are never mounted.
//
// Before moving on, each uploaded side goes past the server's capture check
// (lib/documentCaptureCheck): no face on the printed photo, or a barcode that
// will not read, turns the review footer into a retake notice. A notice, never
// a gate: "Continue anyway" always advances, and a failed or slow check reads
// as no problem.
//
// The per-phase title/description live in the SHEET HEADER (VerificationFlow reads the
// synced `documentCapturePhase` from the store and calls `documentCaptureMeta` in components/stepHeaderCopy),
// not in the body — mirroring Flutter's header `docReviewPhase` sync.

/** Bound on how long Continue waits for the supplementary document video. */
const DOC_VIDEO_WAIT_MS = 8000;
// How long the photo library takes to slide away on iOS before another screen
// can open.
const PICKER_CLOSE_MS = 450;

export function DocumentCaptureStep(): React.ReactElement {
  const config = useVerificationConfig();
  const methods = documentCaptureMethods(config);
  // The camera's hooks live in their own wrapper so an upload-only workflow
  // (`allowDocumentScan: false`) never mounts them: no permission read, no
  // device enumeration, no prompt. The element types stay fixed for a given
  // config, so the capture state below keeps the step's whole lifetime.
  return methods.scan ? (
    <ScanningDocumentCapture allowUpload={methods.upload} />
  ) : (
    <DocumentCapture camera={null} microphone={null} allowUpload />
  );
}

function ScanningDocumentCapture({ allowUpload }: { allowUpload: boolean }): React.ReactElement {
  const config = useVerificationConfig();
  const camera = useDocumentCamera(config.onError);
  const microphone = useDocumentMicrophone();
  return <DocumentCapture camera={camera} microphone={microphone} allowUpload={allowUpload} />;
}

function DocumentCapture({
  camera,
  microphone,
  allowUpload,
}: {
  /** Null in upload-only mode, where each side is a photo from the device. */
  camera: DocumentCamera | null;
  microphone: DocumentMicrophone | null;
  allowUpload: boolean;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  const toast = useToast();
  const config = useVerificationConfig();
  const selectedIdType = useFlowState((s) => s.selectedIdType);
  const api = useFlowState((s) => s.api);
  const setMediaId = useFlowState((s) => s.setMediaId);
  const setMrzScan = useFlowState((s) => s.setMrzScan);
  const mrzScan = useFlowState((s) => s.mrzScan);
  const country = useEffectiveCountry();
  const setDocumentCapturePhase = useFlowState((s) => s.setDocumentCapturePhase);
  const setImmersiveCapture = useFlowState((s) => s.setImmersiveCapture);
  const store = useVerificationStore();
  const nextStep = useFlowState((s) => s.nextStep);
  const sessionId = useFlowState((s) => s.sessionId);

  const documentLabel =
    (selectedIdType && Object.values(ID_TYPES).flat().find((d) => d.key === selectedIdType)?.label) || 'Document';
  const scanSides = selectedIdType ? getScanSides(selectedIdType) : 'front_only';
  const isTwoSided = scanSides === 'front_and_back';

  // "Required: <document>" — shown on the screens either side of the camera,
  // matching the web SDK's badge and Flutter's _RequiredPill. Not over a live
  // viewfinder: that screen is full-bleed and owns the display.
  const requiredPill = (side: 'front' | 'back' | null) => (
    <RequiredDocumentPill
      idTypeLabel={documentLabel}
      sideBadge={isTwoSided && side ? (side === 'back' ? 'Back Side' : 'Front Side') : null}
      stepLabel={isTwoSided && side ? (side === 'back' ? 'Step 2 of 2' : 'Step 1 of 2') : null}
    />
  );
  const guideAspect = documentGuideAspect(selectedIdType);

  const [phase, setPhase] = useState<DocumentCapturePhase>('front');
  const [turnOver, setTurnOver] = useState(false); // the back follows the front untapped
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // compressing a fresh capture
  const [uploading, setUploading] = useState(false);
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cropUri, setCropUri] = useState<string | null>(null); // gallery photo awaiting crop
  const [picking, setPicking] = useState(false); // the photo library is open
  // What the server's capture check found wrong with the uploaded sides. Set
  // only when there is something to retake; any new capture clears it, so the
  // next Continue uploads and checks again.
  const [captureProblems, setCaptureProblems] = useState<CaptureProblem[] | null>(null);
  // Best-effort document videos recorded alongside each side's still (uploaded as
  // document_front_video / document_back_video). Refs — they don't drive the UI.
  const frontVideoRef = useRef<string | null>(null);
  const backVideoRef = useRef<string | null>(null);
  // How each side's photo arrived, for the review switch (afterDocumentCapture).
  const sourcesRef = useRef<{ front: DocumentSideSource; back: DocumentSideSource }>({ front: null, back: null });
  // The review is off and a scan is moving straight on. A problem brings the
  // review back: that is where its Retake and Try Again live.
  const [handingOver, setHandingOver] = useState(false);
  const handoverStartedRef = useRef(false);
  const showHandover = handingOver && phase === 'review' && !uploadError && !captureProblems;

  // Publish the sub-phase so the sheet header (VerificationFlow) shows the right title.
  useEffect(() => {
    setDocumentCapturePhase(showHandover ? 'checking' : phase);
  }, [phase, showHandover, setDocumentCapturePhase]);

  // ── Camera permission + availability ───────────────────────────────────────
  // Owned by `useDocumentCamera` (called by ScanningDocumentCapture), so
  // `camera` is null in upload-only mode and every camera gate below is skipped.
  //
  // Gate the camera path on the user acknowledging the primer. Shown once for
  // the step, not per side — repeating it before the back of a card would be
  // noise, not a warning.
  const [ready, setReady] = useState(false);
  // Sound on the clip: asked for once the person has met the camera step, and
  // settled before the viewfinder mounts, which fixes its audio when created.
  const wantsAudio = !!camera && recordsDocumentAudio(config);
  const waitingForMicrophone = wantsAudio && !microphone?.settled;
  const askMicrophone = microphone?.ask;
  useEffect(() => {
    if (wantsAudio && ready && camera?.perm === 'granted') askMicrophone?.();
  }, [wantsAudio, ready, camera?.perm, askMicrophone]);
  // Tell the shell when the full-bleed camera is on screen. Scoped tightly:
  // only the live preview earns the whole display — the ready primer, the
  // permission screens, the previews and the review all keep their chrome.
  //
  // No unmount cleanup: VerificationFlow already scopes the flag to this step, and a
  // cleanup here would fire during any remount and fight the effect that had
  // just raised it.
  const cameraLive =
    (phase === 'front' || phase === 'back') &&
    ready &&
    !waitingForMicrophone &&
    !!camera &&
    camera.perm === 'granted' &&
    camera.hasDevice;
  useEffect(() => {
    setImmersiveCapture(cameraLive);
  }, [cameraLive, setImmersiveCapture]);

  // ── Capture → compress → store for the current side ────────────────────────
  const storeCapture = useCallback(
    async (rawUri: string, source: 'camera' | 'upload') => {
      setBusy(true);
      setUploadError(null);
      setCaptureProblems(null);
      try {
        const compressed = await compressDocumentImage(rawUri);
        // Read the MRZ off the FRONT while we have it. It is the key that
        // unlocks the chip, and taking it from the photo the user just captured
        // is what spares them scanning the same passport a second time.
        // Best-effort in every sense: most documents have no MRZ, and one that
        // does not read simply leaves the chip step to ask.
        if (phase !== 'back') {
          void scanMrzFromImage(compressed)
            .then((scan) => {
              if (scan) setMrzScan(scan);
            })
            // Explicit, even though the scanner already swallows its own
            // errors: this sits inside the capture path, and the claim above
            // that it is best-effort has to hold for anything that can reject
            // — including a future change to the store setter.
            .catch(() => undefined);
        }
        const side = phase === 'back' ? 'back' : 'front';
        sourcesRef.current[side] = source;
        if (side === 'back') setBackUri(compressed);
        else setFrontUri(compressed);
        const next = afterDocumentCapture(config, {
          side,
          twoSided: isTwoSided,
          ...sourcesRef.current,
          hasBack: side === 'back' || !!backUri,
        });
        if (next === 'preview-front') setPhase('front-preview');
        else if (next === 'scan-back') {
          // Nothing was tapped, so they are still holding up the front.
          setTurnOver(true);
          setPhase('back');
        }
        else {
          setPhase('review');
          setHandingOver(next === 'hand-over');
        }
      } finally {
        setBusy(false);
      }
    },
    [phase, isTwoSided, setMrzScan, config, backUri],
  );

  // Gallery upload: pick the raw photo (no native editor), then open the SDK's
  // interactive ID-card cropper — mirrors the Flutter SDK's _DocumentCropperScreen.
  // Live-camera capture: crop the full frame to the card-guide rectangle first
  // (mirrors Flutter's cropCardRegion), then store. Gallery photos skip this —
  // they're already cropped by the interactive cropper.
  const captureFromCamera = useCallback(
    async (rawUri: string, videoPath: string | null, viewAr: number, framing: CornerFraming | null, turn: CaptureTurn | null) => {
      setBusy(true);
      try {
        // Stash the side's video (best-effort) before cropping/storing the still.
        if (phase === 'back') backVideoRef.current = videoPath;
        else frontVideoRef.current = videoPath;
        // viewAr is the MEASURED preview box — full-screen capture shows a far
        // taller slice than the framed 3:4 box the old constant assumed, which
        // is why reviews came back wider than what the user framed.
        // The detected corners when the corner gate had them (the photo keeps
        // space past every corner); the guide crop only without a detector.
        const carded = await (framing
          ? cropToDocumentCorners(rawUri, framing.quad, framing.frameAspect)
          : turn
            ? cropGuideRegion(rawUri, viewAr, turn.guide)
            : cropCardRegion(rawUri, guideAspect, viewAr)
        ).catch(() => rawUri);
        // An upright slip is turned back to landscape, so the review, the upload
        // and the server see the document the usual way round.
        const upright = turn ? await rotateImage(carded, undoDegrees(turn.readTurn)).catch(() => carded) : carded;
        await storeCapture(upright, 'camera');
      } finally {
        setBusy(false);
      }
    },
    [guideAspect, storeCapture, phase],
  );

  const pickFromGallery = useCallback(async () => {
    // Auto-capture is paused while the library and the crop screen are up, so
    // the camera underneath cannot take a photo of its own meanwhile.
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        // iOS also refuses to open a screen while the library is still sliding
        // away, so give it that moment first.
        if (Platform.OS === 'ios') await new Promise((resolve) => setTimeout(resolve, PICKER_CLOSE_MS));
        setCropUri(result.assets[0].uri);
      }
    } finally {
      setPicking(false);
    }
  }, []);

  // Best-effort document video upload — never blocks or fails the flow.
  /**
   * How long the flow will WAIT for a document video before moving on.
   *
   * The clip is supplementary evidence, but transcoding a 4K recording and
   * pushing it over a phone hotspot is slow — and it used to be awaited with no
   * bound, so the step sat on a spinner indefinitely after the photo had
   * already uploaded fine. The user could not reach the chip step at all.
   *
   * The upload is NOT cancelled at the deadline: it keeps running in the
   * background and still records its media id if it lands, usually well before
   * submission. Only the WAIT is bounded.
   */
  const uploadDocVideo = useCallback(
    async (
      videoPath: string | null,
      type: 'document_front_video' | 'document_back_video',
      mediaKey: 'documentFrontVideo' | 'documentBackVideo',
    ) => {
      if (!videoPath) return;
      const work = (async () => {
        try {
          // Transcode the raw 4K recording down to a small evidence clip first.
          const small = await compressVideo(videoPath);
          if (!small) return; // could not be shrunk below the ceiling: skip it
          const id = await withRetry(() => api.upload({ uri: small, type: 'video/mp4' }, type, MAX_VIDEO_BYTES));
          setMediaId(mediaKey, id);
        } catch {
          /* supplementary — verification proceeds without the document video
             (dropped if it failed to upload or exceeded the 5MB ceiling) */
        }
      })();
      await Promise.race([
        work,
        new Promise<void>((resolve) => setTimeout(resolve, DOC_VIDEO_WAIT_MS)),
      ]);
    },
    [api, setMediaId],
  );

  // ── Advance (VerificationFlow routes to liveness/submitted, or the next multi-ID ID) ─
  // Shared by a clean Continue and "Continue anyway". The media ids are already
  // in the store, so moving on never uploads or checks a second time.
  const advance = useCallback(() => {
    setCaptureProblems(null);
    nextStep();
  }, [nextStep]);

  // ── Upload both sides, check they will read, then advance ──────────────────
  const handleContinue = useCallback(async () => {
    if (!frontUri) return;
    setUploading(true);
    setUploadError(null);
    setCaptureProblems(null);
    setRetryInfo(null);
    const onRetry = (attempt: number, total: number) => setRetryInfo({ attempt, total });
    const uploaded: { side: DocumentCaptureSide; mediaId: string }[] = [];
    try {
      const frontId = await withRetry(() => api.upload({ uri: frontUri, type: 'image/jpeg' }, 'document_front'), { onRetry });
      setMediaId('documentFront', frontId);
      uploaded.push({ side: 'front', mediaId: frontId });
      await uploadDocVideo(frontVideoRef.current, 'document_front_video', 'documentFrontVideo');
      if (isTwoSided && backUri) {
        const backId = await withRetry(() => api.upload({ uri: backUri, type: 'image/jpeg' }, 'document_back'), { onRetry });
        setMediaId('documentBack', backId);
        uploaded.push({ side: 'back', mediaId: backId });
        await uploadDocVideo(backVideoRef.current, 'document_back_video', 'documentBackVideo');
      }
    } catch (err) {
      setRetryInfo(null);
      setUploading(false);
      const verificationError = mapToVerificationError(err, 'upload');
      setUploadError(verificationError.message);
      toast.show({ variant: 'error', title: 'Upload failed', message: verificationError.message });
      safeReportError(config.onError, verificationError);
      return;
    }
    setRetryInfo(null);

    // The same workflow the submission will carry: a KYB flow's document is
    // the applicant's own leg, which submits under the mapped applicant
    // workflow (store/submitApplicant). Best-effort throughout:
    // runCaptureChecks never throws and gives up on a side after 8s.
    const workflowId = isBusinessFlow(config) ? config.applicantWorkflowId : config.workflowId;
    const requests: DocumentCaptureCheckRequest[] = selectedIdType
      ? uploaded.map(({ side, mediaId }) => ({
          mediaId,
          side,
          country,
          idType: selectedIdType,
          ...(workflowId ? { workflowId } : {}),
          ...(sessionId ? { sessionId } : {}),
        }))
      : [];
    const results = await runCaptureChecks(requests, (body, signal) => api.checkDocumentCapture(body, signal));
    const problems = captureCheckProblems(results);
    setUploading(false);
    if (problems.length > 0) {
      setCaptureProblems(problems);
      return;
    }
    advance();
  }, [
    frontUri,
    backUri,
    isTwoSided,
    api,
    setMediaId,
    config,
    toast,
    uploadDocVideo,
    selectedIdType,
    country,
    sessionId,
    advance,
  ]);

  // The scan that just landed uploads with no Continue to press. Once per
  // capture: the review's own buttons take over if this one needs them.
  useEffect(() => {
    if (!handingOver || phase !== 'review' || handoverStartedRef.current) return;
    handoverStartedRef.current = true;
    void handleContinue();
  }, [handingOver, phase, handleContinue]);

  const retake = (side: DocumentCaptureSide) => {
    setHandingOver(false);
    handoverStartedRef.current = false;
    sourcesRef.current[side] = null;
    setUploadError(null);
    setCaptureProblems(null);
    setTurnOver(false);
    if (side === 'back') {
      setBackUri(null);
      backVideoRef.current = null;
      setPhase('back');
    } else {
      setFrontUri(null);
      frontVideoRef.current = null;
      setPhase('front');
    }
  };

  // Interactive ID-card cropper for a gallery photo (Modal — overlays whatever
  // capture sub-screen triggered the upload, including the sim's "camera unavailable").
  // With the camera open it is handed to CameraPhase, which opens it inside the
  // camera's own full-screen modal: opened from the sheet below, iOS refused it.
  const cropper = cropUri ? (
    <DocumentCropper
      uri={cropUri}
      // The document's own shape: the cropper stands a NIN slip's box upright
      // on a phone, and hands back the crop already turned to landscape.
      aspect={guideAspect}
      documentLabel={selectedIdType ? documentLabel : undefined}
      onCancel={() => setCropUri(null)}
      onConfirm={(out) => {
        setCropUri(null);
        void storeCapture(out, 'upload');
      }}
    />
  ) : null;

  // ── Capture (front/back) ───────────────────────────────────────────────────
  // Two distinct error states, distinguished by hardware vs permission (both
  // states keep the title/description in the header, and always offer the gallery
  // escape hatch). These never overlap: one needs a device, the other needs none.
  if (phase === 'front' || phase === 'back') {
    if (!camera) {
      // Upload-only: no ready primer (it describes a camera scan), no
      // permission screens, no viewfinder. The pick runs the same cropper and
      // store path a gallery photo takes from the camera screen.
      return (
        <>
          {cropper}
          <View style={{ marginBottom: spacing.md }}>{requiredPill(phase === 'back' ? 'back' : 'front')}</View>
          <UploadPhase
            isBack={phase === 'back'}
            documentLabel={documentLabel}
            isTwoSided={isTwoSided}
            busy={busy}
            onUpload={pickFromGallery}
          />
        </>
      );
    }
    if (camera.cameraUnavailable) {
      // No back-camera hardware (e.g. a simulator) — permission is moot here.
      return (
        <>
          {cropper}
          <CameraUnavailableView onUpload={pickFromGallery} />
        </>
      );
    }
    if (!ready) {
      // "Here's what happens next", BEFORE the OS prompt — and shown even when
      // permission is already granted, since it is about what the step asks of
      // the user rather than about access.
      return (
        <>
          {cropper}
          <View style={{ marginBottom: spacing.md }}>{requiredPill(phase === 'back' ? 'back' : 'front')}</View>
          <ReadyPrimer content={READY_DOCUMENT} onReady={() => setReady(true)} />
        </>
      );
    }
    if (camera.showPrimer) {
      // Primer before the OS prompt — camera not started yet.
      return (
        <>
          {cropper}
          <CameraPermissionPrimingView
            message={t('primer.camera.bodyDocument')}
            onGrant={camera.requestAccess}
          />
        </>
      );
    }
    if (camera.permissionDenied) {
      // A real camera exists but the OS blocked access.
      return (
        <>
          {cropper}
          <CameraPermissionView onRetry={camera.requestAccess} onUpload={pickFromGallery} />
        </>
      );
    }
    if (waitingForMicrophone) {
      // The OS prompt is up, or about to be.
      return (
        <>
          {cropper}
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <UiPulseLoader size={48} />
          </View>
        </>
      );
    }
    const isBack = phase === 'back';

    return (
      <>
        <CameraPhase
          overlay={cropper}
          isBack={isBack}
          cameraLive={cameraLive}
          active={camera.perm === 'granted'}
          documentLabel={documentLabel}
          guideAspect={guideAspect}
          isTwoSided={isTwoSided}
          busy={busy || picking || !!cropUri}
          allowUpload={allowUpload}
          recordAudio={wantsAudio && !!microphone?.granted}
          country={country}
          idType={selectedIdType ?? undefined}
          mrzAlreadyCaptured={!!mrzScan}
          turnOver={turnOver}
          onMrz={setMrzScan}
          onCapture={(uri, videoPath, viewAr, framing, turn) => void captureFromCamera(uri, videoPath, viewAr, framing, turn)}
          onUpload={pickFromGallery}
          onBack={() => store.getState().previousStep()}
          // The camera is a TRUE full-screen modal now, so it runs under the
          // home indicator and has to clear the real inset — the smaller value
          // that suited the inset sheet leaves the shutter under the gesture bar.
          bottomInset={cameraBottomInset()}
        />
      </>
    );
  }

  // ── Front preview (two-sided) ──────────────────────────────────────────────
  if (phase === 'front-preview') {
    return (
      <View>
        <View style={{ marginBottom: spacing.md }}>{requiredPill('front')}</View>
        <DocImage uri={frontUri!} aspect={guideAspect} />
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <UiButton
              label={camera ? t('common.retake') : 'Replace'}
              variant="outline"
              leadingIcon="refresh"
              onPress={() => retake('front')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <UiButton label={camera ? 'Next: Scan Back' : 'Next: Add Back'} onPress={() => setPhase('back')} />
          </View>
        </View>
      </View>
    );
  }

  // ── Review ─────────────────────────────────────────────────────────────────
  // Silent capture (lib/silentCapture): the rear camera is closed and the
  // person is looking at their photo, so one unposed front-camera frame is
  // taken, headless. Keyed on the captures, so a retake's review takes its own.
  const silentFront =
    camera && camera.perm === 'granted' && silentCaptureEnabled(config) ? (
      <SilentFrontCapture key={`${frontUri ?? ''}|${backUri ?? ''}`} />
    ) : null;
  if (showHandover) {
    return (
      <>
        {silentFront}
        <DocumentHandover retryInfo={uploading ? retryInfo : null} />
      </>
    );
  }
  return (
    <>
      {silentFront}
      <View style={{ marginBottom: spacing.md }}>{requiredPill(null)}</View>
      <DocumentReview
      mode={camera ? 'scan' : 'upload'}
      frontUri={frontUri!}
      backUri={isTwoSided ? backUri : null}
      aspect={guideAspect}
      isBusy={uploading}
      busyOverlay={
        // Standard upload loader — a dark scrim + the pulse-ring loader, drawn
        // INSIDE the preview frame, mirroring the web/Flutter SDKs (and the
        // liveness selfie review).
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.45)',
          }}
        >
          <UiPulseLoader size={48} />
        </View>
      }
      onRetakeFront={() => retake('front')}
      onRetakeBack={() => retake('back')}
      footer={
        <>
          {retryInfo && uploading ? (
            <UiText variant="bodySmall" color={colors.warning} style={{ textAlign: 'center', marginBottom: spacing.sm }}>
              {`Upload failed. Retrying (${retryInfo.attempt}/${retryInfo.total})…`}
            </UiText>
          ) : null}
          {uploadError ? (
            // The error message is shown as a top toast; keep a retry action here.
            <UiButton label="Try Again" onPress={handleContinue} loading={uploading} />
          ) : captureProblems ? (
            // A side will not read: retake it, or carry on with what was sent.
            <CaptureCheckNotice
              problems={captureProblems}
              uploadOnly={!camera}
              onRetake={retake}
              onContinueAnyway={advance}
            />
          ) : (
            <UiButton label={t('common.continue')} onPress={handleContinue} loading={uploading} />
          )}
        </>
      }
      />
    </>
  );
}
