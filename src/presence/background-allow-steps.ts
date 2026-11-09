// ---------------------------------------------------------------------------
// What the phone shows after "Continue with automatic checks", in the OS's own words.
//
// The OS prompt cannot be retried, so the screen before it says exactly what to
// tap. That depends on the platform, on the Android version, and on whether
// location was already allowed: without it the OS asks for "while using" first,
// and only then for "all the time". Before Android 10 there is no "all the
// time" option at all; allowing location is the whole answer.
//
// English on purpose, like the rest of this screen: these name the OS's labels.
// Pure, and mirrors the Flutter SDK's presence_background_allow_steps.dart;
// change both together.
// ---------------------------------------------------------------------------

export interface AllowSteps {
  lead: string;
  /** The OS's own label for the option to tap. */
  tap: string;
}

export interface AllowStepsInput {
  platform: 'ios' | 'android';
  /** Android API level; absent reads as a current phone. */
  androidApi?: number;
  /** Location is already allowed while using the app. */
  foregroundGranted: boolean;
}

const WILL_ASK = 'Next, your phone will ask. Tap:';

export function backgroundAllowSteps(input: AllowStepsInput): AllowSteps {
  const { platform, androidApi, foregroundGranted } = input;
  if (platform === 'ios') {
    return {
      lead: foregroundGranted
        ? WILL_ASK
        : 'Your phone will ask twice. First tap “Allow While Using App”, then:',
      tap: 'Change to Always Allow',
    };
  }
  const api = androidApi ?? Number.MAX_SAFE_INTEGER;
  if (api < 29) return { lead: WILL_ASK, tap: 'Allow' };
  if (api === 29) {
    return {
      lead: foregroundGranted
        ? WILL_ASK
        : 'Your phone will ask twice. First tap “Allow only while using the app”, then:',
      tap: 'Allow all the time',
    };
  }
  return {
    lead: foregroundGranted
      ? 'Next, your phone opens its location settings. Choose:'
      : 'First tap “While using the app”. Your phone then opens its location settings. Choose:',
    tap: 'Allow all the time',
  };
}

/** Shown when the phone's answer could not be seen: where Settings has it. */
export function backgroundSettingsSteps(platform: 'ios' | 'android'): AllowSteps {
  return {
    lead: 'If your phone didn’t ask, open Settings and set Location to:',
    tap: platform === 'ios' ? 'Always' : 'Allow all the time',
  };
}
