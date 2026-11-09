import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// On iPhone the crop screen never opened after a photo was picked from the
// camera screen. The camera is a full-screen modal over the SDK sheet, and the
// crop screen (another modal) was rendered as a sibling of it, so iOS was asked
// to open it from the sheet, which was already showing the camera. iOS refuses
// that silently. It has to be opened from inside the camera's own modal.
// A wiring test: the omission is one misplaced line, and nothing throws.

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('crop screen presentation over the camera', () => {
  it('passes the crop screen into the camera phase, not beside it', () => {
    const step = read('screens/DocumentCaptureStep.tsx');
    expect(step).toMatch(/<CameraPhase\s+overlay=\{cropper\}/);
    expect(step).not.toMatch(/\{cropper\}\s*<CameraPhase/);
  });

  it('renders the overlay inside the full-screen camera modal', () => {
    const phase = read('screens/document/CameraPhase.tsx');
    const modal = phase.slice(phase.indexOf('<Modal'), phase.indexOf('</Modal>'));
    expect(modal).toContain('{p.overlay}');
  });

  it('hands the cropper the document\'s own shape and stores what it returns', () => {
    const step = read('screens/DocumentCaptureStep.tsx');
    expect(step).toContain('aspect={guideAspect}');
    // The cropper turns an upright crop back itself; turning it again here would
    // store the slip on its side.
    const cropper = step.slice(step.indexOf('<DocumentCropper'), step.indexOf('/>', step.indexOf('<DocumentCropper')));
    expect(cropper).not.toContain('rotateImage');
  });

  it('decides the upright box from the stage it measured, and turns the crop back', () => {
    const cropper = read('components/DocumentCropper.tsx');
    // The same input the camera decides from (its measured box), never a
    // window size read at render time.
    expect(cropper).toMatch(/documentCropGuide\(documentAspect, width \/ height\)/);
    expect(cropper).not.toMatch(/Dimensions|useWindowDimensions/);
    expect(cropper).toMatch(/guide\?\.turned \? await rotateImage\(out, undoDegrees\(null\)\)/);
    // Rotate crops the turned photo, not the original.
    expect(cropper).toContain('cropImage(shownUri,');
  });

  it('matches the scan screen: a black stage, the glass tokens and its layout rhythm', () => {
    const cropper = read('components/DocumentCropper.tsx');
    expect(cropper).toContain("export const CROPPER_STAGE = '#000000'");
    expect(cropper).toContain("from './viewfinder/immersiveGlass'");
    expect(cropper).toContain("from '../capture/immersiveLayout'");
    // The photo is letterboxed with a margin, so no handle meets the screen edge.
    expect(cropper).toContain('insetContainRect(naturalW, naturalH, container.w, container.h)');
    // No app-bar band or bordered action bar from the old screen.
    expect(cropper).not.toContain('headerSurface');
    expect(cropper).not.toContain('Crop to ID Card');
    expect(cropper).not.toContain('Drag to reposition');
  });

  it('names the document in the title, with a plain fallback', () => {
    const cropper = read('components/DocumentCropper.tsx');
    expect(cropper).toContain('`Fit your ${label} in the frame`');
    expect(cropper).toContain("'Fit your ID in the frame'");
    expect(cropper).toContain("'Drag the corners to the edges of your ID'");
    const step = read('screens/DocumentCaptureStep.tsx');
    expect(step).toContain('documentLabel={selectedIdType ? documentLabel : undefined}');
  });

  it('keeps Rotate and the confirm label on their catalogue keys', () => {
    const cropper = read('components/DocumentCropper.tsx');
    expect(cropper).toContain("accessibilityLabel={t('uploadDocument.crop.rotate')}");
    expect(cropper).toContain("accessibilityHint={ROTATE_HINT}");
    expect(cropper).toContain("'Turns the photo a quarter turn clockwise.'");
    expect(cropper).toContain("t('uploadDocument.crop.confirm')");
  });

  it('shows the thirds grid only while dragging, natively animated, and still under reduced motion', () => {
    const cropper = read('components/DocumentCropper.tsx');
    expect(cropper).toContain('useNativeDriver: true');
    expect(cropper).toMatch(/if \(reduceMotion\) \{\s*gridOpacity\.setValue\(to\)/);
    expect(cropper).toContain('tapHaptic()');
  });

  it('turns the shown photo smoothly, one turn at a time, and swaps only once the turned file has loaded', () => {
    const cropper = read('components/DocumentCropper.tsx');
    // Native-driven quarter turn, scaled to the turned photo's rect.
    expect(cropper).toContain("outputRange: ['0deg', '90deg']");
    expect(cropper).toContain('quarterTurnScale(imgRect, to)');
    expect(cropper).toMatch(/duration: TURN_MS,\s*easing: Easing\.out\(Easing\.cubic\),\s*useNativeDriver: true/);
    // Never two turns at once.
    expect(cropper).toMatch(/if \(turnBusy\.current \|\| rotating/);
    // The turning copy gives way on the turned photo's onLoad, not before.
    expect(cropper).toMatch(/onLoad=\{\(\) => \{\s*if \(swapPending\.current\) endTurn\(\);/);
    // Still made from the original each time.
    expect(cropper).toContain('next === 0 ? uri : await rotateImage(uri, next * 90)');
  });

  it('pauses auto-capture while a photo is being picked or cropped', () => {
    const step = read('screens/DocumentCaptureStep.tsx');
    expect(step).toContain('busy={busy || picking || !!cropUri}');
  });
});
