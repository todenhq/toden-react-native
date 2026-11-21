import type { FaceWindow } from '../lib/faceWindow';
import type {
  LivenessChallenge,
  LivenessConfig,
  LivenessFaceData,
  LivenessFailureReason,
  LivenessMode,
  LivenessPhase,
} from './types';
import type { FlashResult } from './flashDetector';
import type { PromptTime } from './promptTimeline';
import type { TextFn } from '../i18n/types';
import type { DirectionPlan, PlanRequest } from './directionPlan';
import type { DirectionSides } from './directions';

// ---------------------------------------------------------------------------
// The liveness machine's vocabulary: its UI state, its options, its guidance
// strings and the two phase predicates the handlers branch on.
//
// Split out of useLiveness (200-line rule). Deliberately free of the hook, so
// the phase predicates below can be read — and reasoned about — without the
// state machine around them. They are load-bearing: `isSettled` decides where
// guidance is suppressed, and getting its scope wrong is what once left the
// flash and the capture without a multiple-face check.
// ---------------------------------------------------------------------------

export const INTEGRITY_FAILED_PATCH = {
  phase: 'failed' as const,
  failureReason: 'face_swap' as const,
  instruction: 'Let\u2019s start over. Please stay in frame.',
  activeChallenge: null,
  positionGuidance: null,
};

import { LivenessSpeaker } from './speech';
import type { HeldSelfie, SelfieShot } from '../lib/selfie-candidates';
import type { StillFace } from '../lib/selfie-pick';
import type { VoiceGuidanceOption } from '../types/config';

export const CHALLENGE_PASSED_MS = 700; // brief "Good." before the next challenge
export const POSITION_TOO_FAR = 'too_far';
export const POSITION_TOO_CLOSE = 'too_close';
export const MULTIPLE_FACES_GUIDANCE = 'Make sure only your face is visible';

// The machine's own lines, shown and spoken. Each is the exact text of a Toden
// voice clip (kyc-core docs/VOICE_GUIDANCE.md); a change here sends that line
// to the device voice until the clip is regenerated.
export const CHALLENGE_PASSED_LINE = 'Good.';
export const FLASH_HOLD_INSTRUCTION = 'Hold still. The screen will flash briefly';
export const TIMEOUT_LINE = "Time's up. Please try again.";
export const FACE_LOST_LINE = 'Face lost. Please try again.';

/** Full screen only: the face is beside the window, not in it. */
export const POSITION_OFF_CENTRE = 'off_centre';

export type PositionGuidance =
  | typeof POSITION_TOO_FAR
  | typeof POSITION_TOO_CLOSE
  | typeof POSITION_OFF_CENTRE;
export type LightingGuidance = 'dark' | 'bright';

export interface LivenessUiState {
  phase: LivenessPhase;
  instruction: string;
  activeChallenge: LivenessChallenge | null;
  timeoutRemaining: number;
  completedCount: number;
  totalCount: number;
  positionGuidance: PositionGuidance | null;
  lightingGuidance: LightingGuidance | null;
  multipleFaces: boolean;
  wrongGesture: boolean;
  faceDetected: boolean;
  failureReason: LivenessFailureReason | null;
}

export interface UseLivenessOptions {
  config?: Partial<LivenessConfig>;
  voiceGuidance?: VoiceGuidanceOption;
  /**
   * Toden's API origin, for the voice clips of `voiceGuidance.voice`. Without
   * it every prompt uses the device voice.
   */
  voiceServer?: string;
  /** Who the prompts are for: the country of the document being verified and the app's user reference. */
  voicePerson?: { country?: string | null; userId?: string | null };
  /**
   * Whether the liveness recording carries sound, so the voice clips play
   * beside the microphone without interrupting it (iOS audio session).
   */
  recordsAudio?: boolean;
  /**
   * Fires once on the final capture, when the shutter should close: `live`
   * with the frame that qualified (take the still now), or `best` with the
   * run's best still (lib/selfie-capture-gate.ts).
   */
  onReadyToCapture?: (choice: SelfieChoice) => void;
  /**
   * A frame of the gestures was the best selfie so far: take a silent still
   * now and hand it back through `landSelfieShot` (lib/selfie-candidates.ts).
   */
  onSelfieShot?: (face: LivenessFaceData, shot: SelfieShot) => void;
  /**
   * Whether the step is actually on screen and the user has started.
   *
   * The machine is constructed while the readiness primer is still up — hooks
   * cannot be called conditionally — so without this it announces "Position
   * your face in the circle" to someone still reading the primer, before they
   * have tapped anything. Guidance for a screen the user cannot see is worse
   * than none: it is a voice from nowhere.
   *
   * Defaults true so a consumer that never sets it behaves as before.
   */
  announce?: boolean;
  /** The workflow's copy for the challenge and positioning prompts (shown AND spoken). */
  t?: TextFn;
  /**
   * Asks Core for the gestures of one attempt, head directions or classic
   * (liveness/directionPlan.ts). Called once per attempt with gestures; null
   * or a failure leaves the SDK's own pick in place, with no plan named.
   */
  requestDirectionPlan?: (plan: PlanRequest) => Promise<DirectionPlan | null>;
}

export type { DirectionSides } from './directions';

export interface UseLivenessReturn extends LivenessUiState {
  /** Push a face frame into the machine (call from the frame processor via runOnJS). */
  onFace: (data: LivenessFaceData) => void;
  /** Push a "no face this frame" signal. */
  onNoFace: () => void;
  /**
   * Resolves true once a face is detected AFTER the call, or false on timeout.
   * The capture gate uses this so an empty frame is never photographed.
   */
  awaitFreshFace: (timeoutMs: number) => Promise<boolean>;
  /** Feed live lighting quality (null = ok). */
  setLighting: (guidance: LightingGuidance | null) => void;
  /**
   * The full-screen camera's window onto the frame, or null in the sheet,
   * where the circle shows the whole frame. With one set, the face is judged
   * against the window (lib/faceWindow) rather than the frame.
   */
  setFaceWindow: (window: FaceWindow | null) => void;
  /** Mark the selfie captured → phase `complete`. */
  markComplete: () => void;
  /** Restart the session with a fresh random challenge set. */
  reset: () => void;
  /** True while the machine wants a still captured (phase === 'capturing'). */
  shouldCapture: boolean;
  /** True while the screen should be running the flash sequence. */
  shouldFlash: boolean;
  /** Called by the screen when the flash sequence finishes. */
  completeFlash: (result: FlashResult) => void;
  /** Bumped when an unmeasurable flash is retried: the screen runs a fresh sequence. */
  flashAttempt: number;
  /** The liveness method that actually ran ('both' when flash fell back to gestures). */
  effectiveMode: LivenessMode;
  /**
   * The prompts this run used, in order (e.g. ['turn', 'blink', 'flash']),
   * the gestures a flash-only run fell back to included. Rides the claim.
   */
  challenges: string[];
  /** The flash verdict, once run — carried into the submission as context. */
  /** When each gesture prompt appeared and passed, against the recording. */
  promptTimes: () => PromptTime[] | undefined;
  flashResult: FlashResult | null;
  /** How many face discontinuities the continuity guard saw this session. */
  faceGlitches: number;
  /**
   * True once the session can no longer vouch for who is in frame. The capture
   * path reads this AFTER the still is taken: a substitution detected during
   * `capturing` is recorded silently (so nothing re-lays out mid-capture) and
   * acted on here.
   */
  integrityBroken: boolean;
  /** Live read of the integrity flag — see `isCompromised` in the hook. */
  isCompromised: () => boolean;
  /** Surfaces a failure that was detected mid-capture and deliberately held. */
  reportIntegrityFailure: () => void;
  /** A still asked for by `onSelfieShot` landed (`uri`) or failed (null). */
  landSelfieShot: (shot: SelfieShot, uri: string | null, face: StillFace | null) => void;
  /**
   * When the person last did anything with their face (Date.now(), 0 for
   * never), from liveness/responseWatch. A ref, so the frame loop never
   * re-renders the step: read it on a timer, never in render.
   */
  respondedAtRef: { readonly current: number };
  /** Counts each time the person has held a head direction the wrong way: the
   *  narrator shows the way again when it changes. Never a failure. */
  wrongWayCount: number;
  /** Set when the run asks head directions; null for every other test. */
  directionSides: DirectionSides | null;
  /** The plan Core picked for this attempt, for the claim; undefined when the SDK picked its own. */
  directionPlanId: () => string | undefined;
  /**
   * Called as the flash begins: the colours Core picked for this attempt, in
   * its order, or null for the SDK's own pick. From then on a late plan is
   * refused, so the claim never names a plan whose colours were not shown.
   */
  flashColours: () => string[] | null;
}

/** What the final capture uses: the live frame now, or the run's best still. */
export type SelfieChoice = { source: 'live'; face: LivenessFaceData } | { source: 'best'; selfie: HeldSelfie };

/** Position guidance text (spoken + shown), the voice contract's wording on every SDK. */
export function positionGuidanceText(g: PositionGuidance): string {
  if (g === POSITION_OFF_CENTRE) return 'Centre your face';
  return g === POSITION_TOO_FAR ? 'Move closer' : 'Move further away';
}
/** Lighting warning banner text — the full Flutter strings (shown; the short line below is spoken). */
export function lightingGuidanceText(g: LightingGuidance): string {
  return g === 'dark'
    ? 'It looks dark here. Move to a brighter area or near a light source for better detection.'
    : 'Too bright. Reduce glare or move away from direct light for better detection.';
}
/** The short lighting line spoken when the banner appears, as web and Flutter say it. */
export function lightingSpokenText(g: LightingGuidance): string {
  return g === 'dark' ? 'Move to a brighter area' : 'Too bright. Reduce the glare';
}

/**
 * Phases during which the screen must NOT change layout.
 *
 * While capturing, a re-layout moves the subject mid-shutter. While flashing,
 * the overlay's cutout is measured once when the flash starts, so shifting the
 * preview underneath it leaves the hole in the wrong place — the exact bug the
 * Flutter SDK hit. Guidance banners are also meaningless during a flash, since
 * the screen is deliberately painting the "wrong" light.
 */
export function isSettled(phase: LivenessPhase): boolean {
  return phase === 'capturing' || phase === 'flash';
}

export function isTerminal(phase: LivenessPhase): boolean {
  return phase === 'complete' || phase === 'failed';
}
