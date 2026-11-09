import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

// ---------------------------------------------------------------------------
// Nitro spec for on-device text recognition (VisionCamera v5).
//
// Same shape as the face detector: nitrogen generates the Swift and Kotlin base
// classes from this file, and `nitro.json` autolinks the concrete impls —
// iOS = Apple Vision (`VNRecognizeTextRequest`), Android = Google ML Kit.
//
// It runs inside the camera-thread worklet, so the frame never crosses the JS
// bridge; only the recognised lines come back.
//
// Deliberately returns LINES rather than a parsed MRZ. Parsing belongs in TS
// where it is testable against the ICAO specimen without a device — and the
// check digits, not the recogniser, are what decide whether a read is good.
// ---------------------------------------------------------------------------

export interface TextResult {
  /**
   * Recognised lines, top to bottom. Empty when nothing was found — which is
   * the ordinary case for most frames while the user is still aiming.
   */
  lines: string[];
}

/** Lines read from a turned frame, and the turn that was used. */
export interface TurnedTextResult {
  lines: string[];
  /** Extra clockwise quarter turns applied before reading: 1 or 3. */
  quarterTurns: number;
}

export interface MyazaTextRecognizer extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Recognise text in a camera {@link Frame}. Called per-frame from the
   * VisionCamera worklet.
   *
   * `bottomFraction` restricts recognition to the bottom slice of the frame,
   * where the MRZ lives. Passing 1 scans the whole frame. Cropping is what
   * makes this fast enough to run per-frame AND what stops the printed fields
   * above competing with the MRZ for the recogniser's attention.
   */
  recognizeText(frame: Frame, bottomFraction: number): TextResult;

  /**
   * Recognise the WHOLE frame with an extra quarter turn, for a long document
   * framed upright on a phone held upright (a NIN slip). Read upright, its
   * text runs sideways and comes back as confident nonsense.
   *
   * `quarterTurns` 1 or 3 reads with that many extra clockwise quarter turns.
   * Any other value alternates between the two on each call, for while the
   * direction is not yet known (the person may turn the slip either way); the
   * result says which turn was used. A new
   * method rather than a parameter on `recognizeText`: an app still running an
   * older native build simply lacks it, and the caller falls back to the
   * upright read instead of losing recognition for every document.
   */
  recognizeTextTurned(frame: Frame, quarterTurns: number): TurnedTextResult;

  /**
   * Recognise text in a STILL image at `uri` (a local `file://` path).
   *
   * This is what the document step uses: it captures a photo rather than
   * streaming frames, and reading the MRZ off the picture the user just took is
   * what spares them scanning the same passport twice. Same `bottomFraction`
   * crop as the frame version.
   */
  recognizeTextInImage(uri: string, bottomFraction: number): Promise<TextResult>;

  /**
   * Whether the recogniser can run RIGHT NOW.
   *
   * Android fetches ML Kit's text model through Google Play Services rather
   * than bundling it (see android/build.gradle), so there is a window — first
   * launch, or a device with no GMS at all — where recognition cannot work.
   * This MUST be checked before the camera opens: `recognizeText` can only
   * answer in `TextResult`, where "model missing" and "no text in frame" are
   * both an empty `lines` array, so relying on it would leave auto-capture
   * silently never firing and the MRZ never producing a chip key, with nothing
   * shown to explain why.
   *
   * iOS is always true — Apple Vision is a system framework with nothing to
   * fetch.
   */
  isModelReady(): boolean;

  /**
   * Ask Play Services to download the model, resolving `true` once it is usable
   * and `false` if it cannot be obtained (no GMS, no network, user declined).
   *
   * Call this EARLY — the SDK primes it at flow start, so the download overlaps
   * the consent and ID-type screens and the model is warm by the time the
   * document step runs.
   *
   * Safe to call repeatedly; resolves immediately when already ready.
   */
  prepareModel(): Promise<boolean>;
}
