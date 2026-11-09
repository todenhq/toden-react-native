import { readFileSync } from 'fs';
import { join } from 'path';

import {
  PHOTO_COPY,
  PHOTO_SHUTTER,
  createExitQueue,
  photoFileName,
  photoFileUri,
  photoMimeType,
  photoOverlayParts,
  shutterDisabled,
} from '../components/viewfinder/photoMode';

// "Take a photo" in the SDK's own camera: the full-screen document camera's
// top bar and bottom row, minus the scan. No gates, no guide unless asked for,
// a shutter that is always enabled, and a close that closes the whole flow.

const SRC = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
/** The source without its comments, so prose naming a thing is not a use of it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('photo mode draws no gates and no guide', () => {
  it('has no guide and no instruction unless the caller gives one', () => {
    expect(photoOverlayParts({})).toEqual({ hint: null, guideAspect: null });
    expect(photoOverlayParts({ instruction: '   ', guideAspect: 0 })).toEqual({ hint: null, guideAspect: null });
    expect(photoOverlayParts({ instruction: PHOTO_COPY.fitDocument, guideAspect: 1.586 })).toEqual({
      hint: PHOTO_COPY.fitDocument,
      guideAspect: 1.586,
    });
  });

  it('never mounts the scan machinery', () => {
    for (const rel of ['components/viewfinder/PhotoViewfinder.tsx', 'components/PhotoCamera.tsx']) {
      const src = code(rel);
      for (const scanOnly of [
        'useAutoCapture',
        'useCornerGate',
        'documentTextGate',
        'frameOutput',
        'documentHintText',
        'ImmersiveGuide',
        'ImmersiveOverlay',
        'CardGuide',
        'DocumentGhost',
        'useTurnOverHold',
        'useVideoOutput',
        'immersiveHintTone',
      ]) {
        expect({ rel, uses: src.includes(scanOnly) ? scanOnly : null }).toEqual({ rel, uses: null });
      }
    }
  });

  it('only draws a frame when one was asked for, and the instruction stays neutral', () => {
    const src = code('components/viewfinder/PhotoViewfinder.tsx');
    expect(src).toMatch(/const guide = overlay\.guideAspect && /);
    expect(src).toMatch(/\{guide \? \(/);
    expect(src).toContain('tone="neutral"');
    // The camera has only the still output: nothing reads frames.
    expect(src).toMatch(/outputs=\{\[photoOutput\]\}/);
  });
});

describe('the photo-mode shutter is always enabled', () => {
  it('is never blocked, busy or waiting on a dwell', () => {
    expect(PHOTO_SHUTTER).toEqual({ ready: true, busy: false, progress: 0, blockedHint: null });
    expect(shutterDisabled(PHOTO_SHUTTER)).toBe(false);
    // The rule is BottomBar's own: a gate's hint would disable it.
    expect(shutterDisabled({ ...PHOTO_SHUTTER, blockedHint: 'Move back' })).toBe(true);
  });

  it('hands BottomBar exactly that state, with a camera glyph', () => {
    const src = code('components/viewfinder/PhotoViewfinder.tsx');
    expect(src).toContain('busy={PHOTO_SHUTTER.busy}');
    expect(src).toContain('ready={PHOTO_SHUTTER.ready}');
    expect(src).toContain('progress={PHOTO_SHUTTER.progress}');
    expect(src).toContain('blockedHint={PHOTO_SHUTTER.blockedHint}');
    expect(src).toContain('shutterIcon="camera"');
  });

  it('matches the rule BottomBar applies', () => {
    const bar = code('components/viewfinder/ImmersiveBottomBar.tsx');
    expect(bar).toContain('const ready = cameraReady && !blockedHint;');
    expect(bar).toContain('disabled={busy || !ready}');
  });
});

describe('close closes the flow', () => {
  it('calls the flow close once the camera has gone (iOS)', () => {
    const exits = createExitQueue(true);
    const hide = jest.fn();
    const flowClose = jest.fn();
    exits.leave(hide, flowClose);
    expect(hide).toHaveBeenCalledTimes(1);
    expect(flowClose).not.toHaveBeenCalled();
    exits.dismissed();
    expect(flowClose).toHaveBeenCalledTimes(1);
    // A later dismissal (back) runs nothing parked.
    exits.dismissed();
    expect(flowClose).toHaveBeenCalledTimes(1);
  });

  it('calls the flow close straight away on Android', () => {
    const exits = createExitQueue(false);
    const hide = jest.fn();
    const flowClose = jest.fn();
    exits.leave(hide, flowClose);
    expect(hide).toHaveBeenCalledTimes(1);
    expect(flowClose).toHaveBeenCalledTimes(1);
  });

  it('back only hides the camera', () => {
    const exits = createExitQueue(true);
    const hide = jest.fn();
    exits.leave(hide);
    exits.dismissed();
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('is the flow close StepView provides, and none when closing is turned off', () => {
    const camera = code('components/PhotoCamera.tsx');
    expect(camera).toContain('const flowClose = useFlowClose();');
    expect(camera).toContain('const close = flowClose ? (): void => exits.leave(p.onDismiss, flowClose) : null;');
    expect(camera).toMatch(/onDismiss=\{\(\) => \{\s*setMounted\(false\);\s*exits\.dismissed\(\);/);
    const stepView = code('components/StepView.tsx');
    expect(stepView).toContain('<FlowCloseContext.Provider value={disableClose ? null : onClose}>');
  });

  it('draws the close button where the scan draws its side badge', () => {
    const bar = code('components/viewfinder/ImmersiveControls.tsx');
    expect(bar).toMatch(/\{onClose \? \(\s*<View style=\{\{ position: 'absolute', right: SIDE_MARGIN, top: 0 \}\}>\s*<CloseButton onPress=\{onClose\} \/>/);
    expect(bar).toContain('accessibilityLabel="Close"');
  });
});

describe('the scan is unchanged', () => {
  it('still shows the side badge and the scan glyph', () => {
    const overlay = code('components/viewfinder/ImmersiveOverlay.tsx');
    expect(overlay).toMatch(/<TopBar[\s\S]*?side=\{p\.side\}\s*\/>/);
    expect(overlay).not.toContain('onClose');
    expect(overlay).not.toContain('shutterIcon');
    expect(code('components/viewfinder/ImmersiveBottomBar.tsx')).toContain("shutterIcon = 'scan-line'");
  });
});

describe('the photo paths use the SDK camera', () => {
  it('no longer hand over to the system camera', () => {
    for (const rel of ['screens/usePoaAttach.ts', 'screens/useAddressPhotoAttach.ts', 'screens/useBusinessDocumentAttach.ts']) {
      const src = code(rel);
      expect({ rel, system: src.includes('launchCameraAsync') }).toEqual({ rel, system: false });
      expect(src).toContain('photoCamera:');
    }
  });

  it('is rendered by each step that takes a photo', () => {
    for (const rel of [
      'screens/ProofOfAddressStep.tsx',
      'screens/SupportingDocumentsStep.tsx',
      'screens/BusinessDocumentsStep.tsx',
      'screens/address/AddressEntranceStep.tsx',
    ]) {
      expect({ rel, camera: code(rel).includes('<PhotoCamera') }).toEqual({ rel, camera: true });
    }
  });
});

describe('the photo comes back as the system camera gave it', () => {
  it('as a file URI with its type and name', () => {
    expect(photoFileUri('/var/mobile/tmp/a.jpg')).toBe('file:///var/mobile/tmp/a.jpg');
    expect(photoFileUri('file:///x/a.jpg')).toBe('file:///x/a.jpg');
    expect(photoMimeType('/x/a.jpg')).toBe('image/jpeg');
    expect(photoMimeType('/x/a.JPEG')).toBe('image/jpeg');
    expect(photoMimeType('/x/a.heic')).toBe('image/heic');
    expect(photoFileName('/x/y/IMG_1.jpg')).toBe('IMG_1.jpg');
  });
});

describe('photo-mode copy', () => {
  it('is UK English with no em dashes', () => {
    for (const text of Object.values(PHOTO_COPY)) expect(text).not.toMatch(/—/);
  });
});
