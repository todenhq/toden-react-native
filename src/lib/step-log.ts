// Session step log — records each SDK step the user reaches, with a
// timestamp, so the server can reconstruct the journey on the verification
// timeline ("consent opened → ID type chosen → document captured → …").
// Rides the verify submission as metadata.device.stepLog — the same free-form
// channel the Device Intelligence fingerprint uses: no extra network calls,
// no new endpoint, and old SDKs simply never send it. `sentAt` is stamped at
// collect time so the server can correct client-clock skew against its own
// receipt time. Step names only — never PII. Mirrors the web SDK's
// lib/step-log.ts; keep the two in lockstep.

export interface StepLogEntry {
  step: string;
  at: string;
  /**
   * Which multi-ID check the applicant was on (1-based). Absent on ordinary
   * runs and on the first check.
   *
   * The SERVER cannot tell a slot advance from a back-press: a multi-ID run
   * legitimately returns to the ID picker for its next ID, and by step name
   * that is identical to pressing Back. Only the client knows a slot was
   * committed, so only the client can say.
   */
  slot?: number;
  /** The ID type selected AT THAT MOMENT — a slot's final pick is not what the
   *  applicant was doing earlier in it (pick one ID, go back, settle on
   *  another, and the earlier step would be named for an ID not yet chosen). */
  idType?: string;
}

/**
 * One press of an SDK button. `control` is the text-catalogue key of its label
 * (lib/click-log.ts), `label` its English default; neither is ever what the
 * applicant typed or their data, because only the SDK's own copy can match.
 */
export interface ClickEntry {
  control: string;
  label: string;
  /** The step the press happened on. */
  step: string;
  at: string;
}

/**
 * What got in the way, by a closed code (drop-off insights, kyc-core
 * lib/drop-off). Add-only, and identical on web, React Native and Flutter.
 */
export type JourneyEventCode =
  | 'camera_denied'
  | 'camera_unavailable'
  | 'microphone_denied'
  | 'upload_failed'
  | 'network_error'
  | 'liveness_failed'
  | 'capture_rejected'
  | 'nfc_failed'
  | 'code_resent'
  | 'code_invalid'
  | 'app_backgrounded'
  | 'app_foregrounded'
  | 'flow_closed'
  | 'error_shown';

/** One thing that got in the way, on the step it happened on. `detail` is a closed code too, never text. */
export interface JourneyEvent {
  code: JourneyEventCode;
  step: string;
  at: string;
  detail?: string;
}

/** The SDK and the device, with no identifiers. */
export interface JourneyClient {
  sdk: 'react-native';
  version: string;
  platform: 'ios' | 'android' | 'web';
  os?: string;
  osVersion?: string;
  formFactor?: 'phone' | 'tablet' | 'desktop';
}

export interface StepLog {
  steps: StepLogEntry[];
  clicks?: ClickEntry[];
  events?: JourneyEvent[];
  client?: JourneyClient;
  sentAt: string;
}

const MAX_ENTRIES = 40;
const MAX_CLICKS = 60;
const MAX_EVENTS = 60;
/** A second press of the same button inside this window is a double tap, not a new press. */
const REPEAT_MS = 500;
/** The same thing on the same step inside this window is one event. */
const EVENT_REPEAT_MS = 2000;
/** Back in the app this soon is a permission sheet or a glance, not leaving. */
const BLIP_MS = 1000;
/** A detail is a short closed code; anything else is dropped rather than sent. */
const DETAIL = /^[a-z_]{1,32}$/;

/**
 * Saved straight away, not on the next debounced save: the person may be
 * about to leave, and these are what explains why. A network error is not
 * one of them (it would be saved over the network that just failed); the next
 * save carries it.
 */
const SAVE_AT_ONCE: ReadonlySet<JourneyEventCode> = new Set([
  'camera_denied',
  'camera_unavailable',
  'upload_failed',
  'flow_closed',
  'app_backgrounded',
]);
/** Saved straight away from the second time on: one failure is ordinary. */
const SAVE_ON_REPEAT: ReadonlySet<JourneyEventCode> = new Set(['liveness_failed', 'capture_rejected', 'nfc_failed']);

let entries: StepLogEntry[] = [];
let clicks: ClickEntry[] = [];
let events: JourneyEvent[] = [];
const saveListeners = new Set<() => void>();

/** Fresh slate per session (called from the store's reset — each modal open). */
export function resetStepLog(): void {
  entries = [];
  clicks = [];
  events = [];
}

/**
 * Told when an event should be saved straight away (store/session.ts saves the
 * progress then). Returns the unsubscribe.
 */
export function onJourneySaveNeeded(listener: () => void): () => void {
  saveListeners.add(listener);
  return () => {
    saveListeners.delete(listener);
  };
}

/**
 * Records something that got in the way, on the step the person is on.
 * Never throws and never blocks: a listener that throws is ignored.
 */
export function recordJourneyEvent(code: JourneyEventCode, detail?: string, now: Date = new Date()): void {
  const step = entries[entries.length - 1]?.step ?? 'unknown';
  const safeDetail = detail && DETAIL.test(detail) ? detail : undefined;
  const last = events[events.length - 1];
  // Back within a second of leaving: the leaving was a permission sheet or a
  // glance at a notification, so neither is kept.
  if (code === 'app_foregrounded' && last?.code === 'app_backgrounded' && now.getTime() - Date.parse(last.at) < BLIP_MS) {
    events = events.slice(0, -1);
    return;
  }
  const same = [...events]
    .reverse()
    .find((e) => e.code === code && e.detail === safeDetail && e.step === step);
  if (same && now.getTime() - Date.parse(same.at) < EVENT_REPEAT_MS) return;
  events.push({ code, step, at: now.toISOString(), ...(safeDetail ? { detail: safeDetail } : {}) });
  if (events.length > MAX_EVENTS) events = events.slice(events.length - MAX_EVENTS);
  const repeats = events.filter((e) => e.code === code).length;
  if (SAVE_AT_ONCE.has(code) || (SAVE_ON_REPEAT.has(code) && repeats >= 2)) {
    for (const listener of [...saveListeners]) {
      try {
        listener();
      } catch {
        // A save that cannot start must never reach the person.
      }
    }
  }
}

/** The events recorded so far (tests and the save's "untouched" check). */
export function journeyEventCount(): number {
  return events.length;
}

/** Records a press of a named SDK button on the step the applicant is on. */
export function recordClick(control: string, label: string, now: Date = new Date()): void {
  if (clicks.length >= MAX_CLICKS) return;
  const step = entries[entries.length - 1]?.step ?? 'unknown';
  const last = clicks[clicks.length - 1];
  if (last && last.control === control && last.step === step && now.getTime() - new Date(last.at).getTime() < REPEAT_MS) return;
  clicks.push({ control, label, step, at: now.toISOString() });
}

/** Records a step visit. Consecutive duplicates are collapsed; back-and-forth
 *  navigation is kept — repeat visits are honest journey data. */
export function recordStep(step: string, slot?: number, idType?: string): void {
  if (entries.length >= MAX_ENTRIES) return;
  const last = entries[entries.length - 1];
  // A revisit on a NEW check, or on a DIFFERENT ID, is a different visit.
  if (last?.step === step && last.slot === slot && last.idType === idType) return;
  entries.push({
    step,
    at: new Date().toISOString(),
    ...(slot ? { slot } : {}),
    ...(idType ? { idType } : {}),
  });
}

/** Snapshot attached to the verify submission and each progress save. Null when
 *  nothing was recorded so the field is simply absent. `client` is the SDK and
 *  device (services/deviceMetadata.ts journeyClient), passed in so this module
 *  stays free of native imports. */
export function getStepLog(client?: JourneyClient): StepLog | null {
  if (entries.length === 0 && clicks.length === 0 && events.length === 0) return null;
  return {
    steps: [...entries],
    ...(clicks.length > 0 ? { clicks: [...clicks] } : {}),
    ...(events.length > 0 ? { events: [...events] } : {}),
    ...(client ? { client } : {}),
    sentAt: new Date().toISOString(),
  };
}

/** The closed detail for a camera that would not run: another app holds it, or something else. */
export function cameraErrorDetail(error: unknown): 'in_use' | 'other' {
  const text = `${(error as { code?: unknown })?.code ?? ''} ${(error as { message?: unknown })?.message ?? error ?? ''}`;
  return /in[\s_-]?use|busy|another|interrupted|max-cameras|maximum number/i.test(text) ? 'in_use' : 'other';
}

/** A camera session's `onError`: recorded as `camera_unavailable`, and logged in development. */
export function recordCameraError(error: unknown): void {
  recordJourneyEvent('camera_unavailable', cameraErrorDetail(error));
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[Verification] camera error:', error);
}

/** The closed detail for an upload, from its media type. */
export function uploadDetail(type: string): 'document' | 'selfie' | 'video' | 'supporting_document' | 'proof_of_address' | 'other' {
  if (type === 'document_front' || type === 'document_back') return 'document';
  if (type === 'selfie') return 'selfie';
  if (type.endsWith('_video') || type === 'video') return 'video';
  if (type === 'supporting_document' || type === 'signature') return 'supporting_document';
  if (type === 'proof_of_address') return 'proof_of_address';
  return 'other';
}

/** An upload that failed after the SDK's own retries: recorded as `upload_failed`. */
export function recordUploadFailure(type: string): void {
  recordJourneyEvent('upload_failed', uploadDetail(type));
}

/**
 * Whether a thrown request error is the network failing, rather than the SDK
 * cancelling its own request (an address search replaced by the next
 * keystroke, a step left mid-request), which says nothing about the person's
 * connection.
 */
export function isNetworkFailure(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  return name !== 'AbortError';
}

/** The closed detail for a request that never got an answer: it timed out, or something else (offline, DNS). */
export function networkErrorDetail(error: unknown): 'timeout' | 'other' {
  const name = (error as { name?: unknown })?.name;
  const message = String((error as { message?: unknown })?.message ?? '');
  return name === 'TimeoutError' || /time(d)?\s?out/i.test(message) ? 'timeout' : 'other';
}
