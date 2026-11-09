import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Camera, usePhotoOutput, useVideoOutput } from 'react-native-vision-camera';

import { radius, spacing } from '../config/theme';
import { FRAMED_VIEW_AR } from '../services/cardCrop';
import { DOCUMENT_VIDEO_BITRATE, VIDEO_CAPTURE_RESOLUTION } from '../config/captureSettings';
import { useTheme } from './runtime';
import { documentHintIsAction, documentHintText, useAutoCapture, type AutoCaptureState, type CornerFraming } from '../capture';
import { shortDocumentLabel, specimenTitle } from '../config/idTypes';
import { useTurnOverHold } from './viewfinder/TurnOverPrompt';
import { regionCountryName } from '../config/regions';
import type { MrzScan } from '../mrz/parse';
import { useVideoRecorder } from './useVideoRecorder';
import { CardGuide } from './viewfinder/CardGuide';
import { HintBanner, OverlayButton, Shutter } from './viewfinder/ViewfinderControls';
import { ImmersiveOverlay } from './viewfinder/ImmersiveOverlay';
import { immersiveHintTone } from './viewfinder/immersiveGlass';
import { Spinner } from './Spinner';
import { useTorch } from './viewfinder/useTorch';
import { useBackCamera } from './viewfinder/useBackCamera';
import { cameraTopInset } from './viewfinder/cameraInsets';
import { guideFractions, guideRect, immersiveBand, screenGuideAspect, turnsDocument, type GuideRect } from '../capture/documentTurn';

// Back-camera viewfinder for document capture — the RN mirror of the Flutter
// SDK's _DocumentViewfinder. Shows a VisionCamera preview with an ID-card guide
// overlay + shutter. This component is only rendered once a camera device
// exists (or while it's still resolving — a brief spinner); the "Camera not
// available" error (no device / init failure) is owned by the parent step, which
// shows a prominent error + upload fallback. Capture, auto or manual, waits for
// the document's four corners to be in view with space past each (the corner
// gate in capture/useCornerGate.ts), and the photo is cropped to those corners.

/**
 * Which way the camera's outputs are turned upright on Android: the SCREEN's
 * way, as the preview is. VisionCamera's default follows the accelerometer, so
 * a phone held near flat over a slip and tipped sideways streamed landscape
 * frames under a portrait preview, and the corners were judged in a space the
 * user was not looking at (a corner off the screen could pass). iOS measures in
 * the portrait frame whatever the accelerometer says, so it keeps the default.
 */
const DOCUMENT_ORIENTATION_SOURCE = Platform.OS === 'android' ? 'interface' : undefined;

export interface CameraViewfinderProps {
  active: boolean;
  side: 'front' | 'back';
  documentLabel: string;
  /** Receives the captured still + a best-effort short document video (or null). */
  onCapture: (
    uri: string,
    videoPath: string | null,
    /** Aspect (w÷h) of the box the preview rendered in — what the crop must match. */
    viewAr: number,
    /** The document's detected corners, when the corner gate had them: crop to these. */
    framing: CornerFraming | null,
    /**
     * Set when the document was framed upright (documentTurn.ts): the guide's
     * shares of the preview box, for the crop, and the quarter turns that last
     * read it (or null), to turn the capture back to landscape.
     */
    turn: { guide: GuideRect; readTurn: number | null } | null,
  ) => void;
  /** Card-guide aspect (width ÷ height): 1.586 for ID cards, 1.42 for passports. */
  guideAspect?: number;
  /** Capture is disabled while a previous capture/compress is in flight. */
  busy?: boolean;
  /** ISO-2 country + ID key — what auto-capture checks the document against. */
  country?: string;
  idType?: string;
  /** Banked when a frame yields a check-digit-valid MRZ (the chip's key). */
  onMrz?: (scan: MrzScan) => void;
  /** An MRZ is already stored, so the gate need not hold out for one. */
  mrzAlreadyCaptured?: boolean;
  /**
   * Fill the parent instead of sitting in a 3:4 box.
   *
   * Used by immersive capture: the camera owns the whole screen, because a
   * small preview is exactly what makes users hold a document too far away for
   * the MRZ to resolve.
   */
  fill?: boolean;
  /** Drawn top-left in immersive mode, where the sheet's chrome is gone. */
  onBack?: (() => void) | null;
  /** The gallery escape, kept in immersive mode — it is the fallback when the
   *  camera simply will not read a worn or laminated document. */
  onUpload?: (() => void) | null;
  /** Safe-area bottom inset; the full-bleed camera runs under the indicator. */
  bottomInset?: number;
  /** Record sound on the side's video. Fixed when the output is created. */
  recordAudio?: boolean;
  /** This side followed the last with nothing tapped between them, so the person
   *  is still holding up the other side. The camera waits and says so. */
  turnOver?: boolean;
}

export function CameraViewfinder({
  active,
  side,
  documentLabel,
  onCapture,
  guideAspect = 1.586,
  busy = false,
  country,
  idType,
  onMrz,
  mrzAlreadyCaptured = false,
  fill = false,
  onBack,
  onUpload,
  bottomInset = 0,
  recordAudio = false,
  turnOver,
}: CameraViewfinderProps): React.ReactElement {
  const { colors } = useTheme();
  // A back camera that can torch, when there is one (useBackCamera.ts).
  const device = useBackCamera();
  // v5: document-conservative still (OCR). Capture via the photo output, not a
  // camera ref. Quality is prioritised so small text stays legible.
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'quality' });
  // A short, bitrate-capped document video recorded alongside the still (uploaded
  // best-effort as document_front_video / document_back_video). Mirrors Flutter.
  const videoOutput = useVideoOutput({
    enableAudio: recordAudio,
    fileType: 'mp4',
    targetBitRate: DOCUMENT_VIDEO_BITRATE,
    targetResolution: VIDEO_CAPTURE_RESOLUTION,
    // iOS only honours targetBitRate/targetResolution on the AVAssetWriter
    // pipeline; without this it records full-quality (the front clip exceeded the
    // 25MB upload cap). This keeps the document video small.
    enablePersistentRecorder: true,
  });
  const ready = !!device;
  const recorder = useVideoRecorder(videoOutput, ready);

  // Record while the side's camera is live; restart when the side changes.
  useEffect(() => {
    if (active && ready) recorder.start();
    return () => {
      void recorder.stop();
    };
    // `side` in the deps restarts the recording for the back side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, side]);

  // Immersive insets its own controls (there is no header to sit under).
  //
  // The guide is sized from the MEASURED container, not the window: on iOS the
  // modal is a pageSheet, which is inset from the top of the screen, so window
  // dimensions overshoot — the frame would sit low and the bottom bar would run
  // off the edge. onLayout gives the box this actually renders into.
  const [box, setBox] = useState({ width: 0, height: 0 });
  const boxRef = useRef(box);
  boxRef.current = box;

  // A long document (a NIN slip) is framed upright on a phone held upright, so
  // it uses the screen's height (documentTurn.ts). Full screen only: the framed
  // in-sheet viewfinder keeps today's frame.
  const viewArNow = fill && box.width > 0 && box.height > 0 ? box.width / box.height : FRAMED_VIEW_AR;
  const turned = fill && turnsDocument(guideAspect, viewArNow);
  const screenAspect = screenGuideAspect(guideAspect, turned);
  const turnedRef = useRef(turned);
  turnedRef.current = turned;
  const topInset = cameraTopInset();
  const band = immersiveBand(topInset, bottomInset);
  const bandRef = useRef(band);
  bandRef.current = band;
  // The drawn upright guide, so a slip held too close is told to move back.
  const turnedGuide = useMemo(
    () => (turned ? guideFractions(guideRect(box.width, box.height, screenAspect, band), box.width, box.height) : undefined),
    [turned, box.width, box.height, screenAspect, band.topReserve, band.bottomReserve],
  );

  const capturingRef = useRef(false);
  // Read at press time: the corner gate's state can move between renders.
  const autoRef = useRef<AutoCaptureState | null>(null);
  const capture = useCallback(async () => {
    if (busy || !ready || capturingRef.current) return;
    if (autoRef.current?.shutterBlocked()) return;
    const framing = autoRef.current?.cornerFraming() ?? null;
    // Guarded because auto-capture and the manual shutter can now both fire —
    // two concurrent captures contend for the camera and one of them fails.
    capturingRef.current = true;
    try {
      // Stop the video first (and grab its path) so the still and the clip don't
      // contend for the camera, then capture the OCR still.
      const videoPath = await recorder.stop();
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      // The MEASURED box, via ref (state would be stale in this callback).
      // Full-screen capture shows a much taller slice of the photo than the
      // framed 3:4 box did; the crop must be told which one the user saw.
      const b = boxRef.current;
      const viewAr = b.width > 0 && b.height > 0 ? b.width / b.height : FRAMED_VIEW_AR;
      const turn = turnedRef.current
        ? {
            guide: guideFractions(guideRect(b.width, b.height, 1 / guideAspect, bandRef.current), b.width, b.height),
            readTurn: autoRef.current?.readTurn() ?? null,
          }
        : null;
      onCapture(`file://${file.filePath}`, videoPath, viewAr, framing, turn);
    } catch {
      /* a failed shutter is a no-op — the user can tap again */
    } finally {
      capturingRef.current = false;
    }
  }, [busy, ready, recorder, photoOutput, onCapture, guideAspect]);

  // Only over the full-screen camera, where the prompt can be drawn.
  const turnedOver = !!turnOver && !!fill && side === 'back';
  const { turning, finish: finishTurn } = useTurnOverHold(turnedOver);

  // ── Auto-capture ──────────────────────────────────────────────────────────
  // Runs only with a document to check against; without one there is nothing to
  // identify the frame as, and firing on "some text" would shoot anything.
  const auto = useAutoCapture({
    enabled: active && ready && !busy && !turning && !!country && !!idType,
    country: country ?? '',
    idType: idType ?? '',
    // The back has no branding to identify itself by — the gate relaxes its
    // identity and text-density demands there (see documentIdentity.ts).
    side,
    mrzAlreadyCaptured,
    onMrz,
    guideAspect: screenAspect,
    turned,
    guide: turnedGuide,
    // Front and back are the same idType; without this the gate stays latched
    // from the front and the back never auto-captures.
    resetKey: side,
    onFire: () => void capture(),
    viewAr: viewArNow,
    cameraActive: active && ready,
  });
  autoRef.current = auto;

  const { torch, cameraRef, toggleTorch } = useTorch();
  // Honest again: the device SELECTION above prefers a torch-capable camera,
  // so when this is false there genuinely is no back camera with a flash unit
  // and the button would be a lie. (An earlier fix trusted Android blindly,
  // which produced a visible button driving a flashless camera — CameraX
  // rejected every toggle with "No flash unit".)
  const hasTorch = device?.hasTorch ?? false;

  // While the corner gate holds the shutter, its instruction is the one to show.
  const blockedHint = auto.cornerHint ? documentHintText(auto.cornerHint, documentLabel) : null;
  const hintText = blockedHint ?? documentHintText(auto.guidance.hint, documentLabel);
  // The gate's live instruction once it has a document to judge; the static
  // prompt until then (it needs a country + ID type to say anything useful).
  const hint =
    (country && idType) || blockedHint
      ? hintText
      : `Align the ${side === 'back' ? 'BACK' : 'FRONT'} of your ${documentLabel}`;
  const hintIsAction = !!blockedHint || documentHintIsAction(auto.guidance.hint);


  return (
    <View
      onLayout={
        fill
          ? (e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width !== box.width || height !== box.height) setBox({ width, height });
            }
          : undefined
      }
      style={
        fill
          ? { flex: 1, overflow: 'hidden', backgroundColor: '#000000' }
          : { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#111111' }
      }
    >
      {/* Mounted only once permission is GRANTED, not merely when a device
          exists. VisionCamera configures its session on mount, and doing that
          during the brief "requesting" window throws "Camera Permission not yet
          granted!" as an uncaught rejection — `isActive={false}` does not
          prevent the configuration. */}
      {ready && active ? (
        <Camera
          ref={cameraRef}
          style={{ flex: 1 }}
          device={device}
          isActive={active}
          outputs={[photoOutput, videoOutput, auto.frameOutput]}
          orientationSource={DOCUMENT_ORIENTATION_SOURCE}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner color="#FFFFFF" />
        </View>
      )}

      {ready && active && fill && box.height > 0 ? (
        <ImmersiveOverlay
          side={side}
          country={country ?? ''}
          documentLabel={shortDocumentLabel(idType ?? null, documentLabel)}
          guideAspect={screenAspect}
          hint={hint}
          hintIsAction={hintIsAction}
          hintTone={immersiveHintTone({
            hint: auto.guidance.hint,
            framing: auto.guidance.framing,
            hintIsAction,
            blocked: !!blockedHint,
          })}
          progress={auto.progress}
          busy={busy}
          torch={torch}
          hasTorch={hasTorch}
          onToggleTorch={() => void toggleTorch()}
          onCapture={capture}
          blockedHint={blockedHint}
          onBack={onBack ?? null}
          onUpload={onUpload ?? null}
          bottomInset={bottomInset}
          width={box.width}
          height={box.height}
          topInset={topInset}
          framing={auto.guidance.framing}
          turnedOver={turnedOver}
          turning={turning}
          onTurned={finishTurn}
          subject={{
            idType: idType ?? null,
            title: specimenTitle(idType ?? null, documentLabel),
            country: country ? regionCountryName(country) : null,
            side,
          }}
        />
      ) : null}

      {/* Framed (in-sheet) overlay */}
      {ready && active && !fill ? (
        <>
          <CardGuide guideAspect={guideAspect} primary={colors.primary} />
          <HintBanner
            fill={false}
            isAction={hintIsAction}
            text={hint}
          />

          {hasTorch ? (
            <OverlayButton
              icon="lightbulb"
              side="right"
              fill={false}
              active={torch}
              label={torch ? 'Turn off the torch' : 'Turn on the torch'}
              onPress={() => void toggleTorch()}
            />
          ) : null}
        </>
      ) : null}

      {/* Immersive draws its own shutter inside BottomBar (with the torch and
          the upload escape), so only the framed variant needs this one. */}
      {fill ? null : (
        <Shutter onPress={capture} ready={ready} busy={busy} progress={auto.progress} blockedHint={blockedHint} />
      )}
    </View>
  );
}
