import React, { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { Camera, CommonResolutions, usePhotoOutput } from 'react-native-vision-camera';

import { radius } from '../../config/theme';
import { fileSizeOf } from '../../services/mediaCompress';
import { guideRect } from '../../capture/documentTurn';
import { hintTop } from '../../capture/immersiveLayout';
import { Spinner } from '../Spinner';
import { TopBar } from './ImmersiveControls';
import { BottomBar, HintPill } from './ImmersiveBottomBar';
import { IMMERSIVE_GLASS } from './immersiveGlass';
import { useBackCamera } from './useBackCamera';
import { useTorch } from './useTorch';
import {
  PHOTO_COPY,
  PHOTO_SHUTTER,
  photoFileName,
  photoFileUri,
  photoMimeType,
  photoOverlayParts,
  type CapturedPhoto,
} from './photoMode';

// A photo, not a scan: the immersive document camera's top bar and bottom row
// over a plain back-camera preview. No auto-capture, no corner, framing or text
// gate, no live instruction and no guide unless the caller asks for one. The
// shutter is always enabled and takes the full-resolution still as it is; the
// caller's own shrink-then-size-check path runs on it after.

export interface PhotoViewfinderProps {
  active: boolean;
  title: string;
  instruction?: string | null;
  guideAspect?: number | null;
  onPhoto: (photo: CapturedPhoto) => void;
  onBack: () => void;
  onClose: (() => void) | null;
  onUpload: (() => void) | null;
  topInset: number;
  bottomInset: number;
}

export function PhotoViewfinder(p: PhotoViewfinderProps): React.ReactElement {
  const device = useBackCamera();
  // Full resolution: the largest 4:3 still the camera offers, at full quality.
  // JPEG, as the system camera wrote, so the result reads as it did.
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.HIGHEST_4_3,
    containerFormat: 'jpeg',
    quality: 1,
    qualityPrioritization: 'quality',
  });
  const { torch, cameraRef, toggleTorch } = useTorch();
  const hasTorch = device?.hasTorch ?? false;
  const ready = !!device;

  const [box, setBox] = useState({ width: 0, height: 0 });
  const overlay = photoOverlayParts({ instruction: p.instruction, guideAspect: p.guideAspect });
  const guide = overlay.guideAspect && box.height > 0 ? guideRect(box.width, box.height, overlay.guideAspect) : null;

  // The shutter is never disabled; this drops a second tap while the first
  // still is being written, so two captures never contend for the camera.
  const capturingRef = useRef(false);
  const { onPhoto } = p;
  const capture = useCallback(async () => {
    if (!ready || capturingRef.current) return;
    capturingRef.current = true;
    try {
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      const uri = photoFileUri(file.filePath);
      let fileSize: number | null = null;
      try {
        fileSize = fileSizeOf(uri);
      } catch {
        fileSize = null;
      }
      onPhoto({ uri, mimeType: photoMimeType(file.filePath), fileSize, fileName: photoFileName(file.filePath) });
    } catch {
      /* a failed shutter is a no-op: the user can tap again */
    } finally {
      capturingRef.current = false;
    }
  }, [ready, photoOutput, onPhoto]);

  return (
    <View
      style={{ flex: 1, overflow: 'hidden', backgroundColor: '#000000' }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== box.width || height !== box.height) setBox({ width, height });
      }}
    >
      {ready && p.active ? (
        <Camera ref={cameraRef} style={{ flex: 1 }} device={device} isActive={p.active} outputs={[photoOutput]} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner color="#FFFFFF" />
        </View>
      )}

      {guide ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: guide.x,
            top: guide.y,
            width: guide.width,
            height: guide.height,
            borderRadius: radius.lg,
            borderWidth: 2,
            borderColor: IMMERSIVE_GLASS.caption,
          }}
        />
      ) : null}

      {box.height > 0 ? (
        <>
          <TopBar
            topInset={p.topInset}
            width={box.width}
            onBack={p.onBack}
            country=""
            documentLabel={p.title}
            onClose={p.onClose}
          />
          {overlay.hint ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: hintTop(p.topInset), left: 0, right: 0, alignItems: 'center' }}
            >
              <HintPill hint={overlay.hint} tone="neutral" maxWidth="88%" />
            </View>
          ) : null}
          <BottomBar
            allowUpload={!!p.onUpload}
            onUpload={() => p.onUpload?.()}
            onCapture={() => void capture()}
            busy={PHOTO_SHUTTER.busy}
            ready={PHOTO_SHUTTER.ready}
            progress={PHOTO_SHUTTER.progress}
            blockedHint={PHOTO_SHUTTER.blockedHint}
            hasTorch={hasTorch}
            torch={torch}
            onToggleTorch={() => void toggleTorch()}
            bottomInset={p.bottomInset}
            shutterIcon="camera"
            uploadHint={PHOTO_COPY.uploadHint}
          />
        </>
      ) : null}
    </View>
  );
}
