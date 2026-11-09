// ---------------------------------------------------------------------------
// The "allow all the time" ask, made at the moment it is needed.
//
// The OS gives roughly one real chance to ask: iOS shows the upgrade to Always
// once, and Android 11+ sends the person to a settings page many back out of.
// So the ask is not made cold on the success screen. A short screen of its own
// comes first and gives the person their own reasons: less effort, done
// sooner, and only this one address. The success screen then reflects the
// answer, with a way to turn it on later.
//
// The rules here are pure and mirror the Flutter SDK's
// presence_background_primer.dart; change both together.
// ---------------------------------------------------------------------------

/** The server's default policy (kyc-core presence/types.ts DEFAULT_POLICY). */
export const DEFAULT_PRESENCE_POLICY = { windowDays: 10, minNights: 3, minDays: 5 } as const;

/**
 * What one app-open report is worth, in tenths of a day or night (kyc-core
 * presence/types.ts SOURCE_WEIGHTS: foreground 0.6, geofence 1.0). Tenths
 * keep the arithmetic exact, as the server's scorer does.
 */
const FOREGROUND_TENTHS = 6;

export interface PresencePolicyInput {
  windowDays?: number;
  minNights?: number;
  minDays?: number;
}

export interface PrimerInputs {
  /** Presence on, a user reference, and background not switched off. */
  wantsBackground: boolean;
  /** The app can receive fence events (RN: registerBackgroundPresence()). */
  registered: boolean;
  /** "Allow all the time" is already granted, so arming needs no prompt. */
  alwaysGranted: boolean;
  /** The submission is being shown again (a resumed session), not made now. */
  resumed: boolean;
}

/**
 * `'primer'` shows the explanation screen and then the OS prompt; `'silent'`
 * arms with no prompt (already granted); `'skip'` asks nothing.
 */
export type PrimerDecision = 'primer' | 'silent' | 'skip';

export function backgroundPrimerDecision(i: PrimerInputs): PrimerDecision {
  if (!i.wantsBackground || !i.registered || i.resumed) return 'skip';
  return i.alwaysGranted ? 'silent' : 'primer';
}

/** Whole numbers within the server's bounds, the default where absent. */
function policyOf(p: PresencePolicyInput | undefined) {
  const pick = (v: number | undefined, d: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : d;
  return {
    windowDays: Math.max(1, pick(p?.windowDays, DEFAULT_PRESENCE_POLICY.windowDays)),
    minNights: pick(p?.minNights, DEFAULT_PRESENCE_POLICY.minNights),
    minDays: Math.max(1, pick(p?.minDays, DEFAULT_PRESENCE_POLICY.minDays)),
  };
}

/** App opens needed to reach `required` days or nights on app-open reports. */
function opensFor(required: number): number {
  return Math.ceil((required * 10) / FOREGROUND_TENTHS);
}

export interface PresenceEffort {
  /** App opens needed without background checks. */
  count: number;
  /** Evenings at home (a person), or days at the premises (a business). */
  unit: 'evenings' | 'days';
}

/**
 * What it takes to finish WITHOUT background checks. A person passes on
 * nights or days, whichever needs fewer opens, and nights come first for the
 * same count since an evening at home is what most people manage. A business
 * premises counts days only (minNights 0).
 */
export function effortWithoutBackground(
  policy: PresencePolicyInput | undefined,
  isBusiness: boolean,
): PresenceEffort {
  const p = policyOf(policy);
  const days = opensFor(p.minDays);
  if (isBusiness || p.minNights <= 0) return { count: days, unit: 'days' };
  const nights = opensFor(p.minNights);
  return nights <= days ? { count: nights, unit: 'evenings' } : { count: days, unit: 'days' };
}

/** The window the check runs in: the honest upper bound on "done sooner". */
export function confirmWithinDays(policy: PresencePolicyInput | undefined): number {
  return policyOf(policy).windowDays;
}

/** "Otherwise, open the app at home on 5 different evenings." */
export function effortSentence(effort: PresenceEffort, isBusiness: boolean): string {
  const where = isBusiness ? 'at the premises' : 'at home';
  const unit = effort.unit === 'evenings'
    ? (effort.count === 1 ? 'evening' : 'evenings')
    : (effort.count === 1 ? 'day' : 'days');
  const different = effort.count === 1 ? '' : ' different';
  return `Otherwise, open the app ${where} on ${effort.count}${different} ${unit}.`;
}

/** "Usually confirmed within 10 days." */
export function withinSentence(days: number): string {
  return `Usually confirmed within ${days} ${days === 1 ? 'day' : 'days'}.`;
}

/** The success card's line when background checks are off. */
export function finishSentence(effort: PresenceEffort, isBusiness: boolean): string {
  const where = isBusiness ? 'at the premises' : 'at home';
  const unit = effort.unit === 'evenings'
    ? (effort.count === 1 ? 'evening' : 'evenings')
    : (effort.count === 1 ? 'day' : 'days');
  return `Open the app ${where} on ${effort.count} ${unit} to finish, or continue with automatic checks.`;
}
