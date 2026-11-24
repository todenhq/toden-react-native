// ---------------------------------------------------------------------------
// The BACKGROUND presence tier — the OkHi model (user decision 2026-08-31):
// one consent, then the OS wakes this SDK on geofence transitions and
// residency keeps being confirmed with nobody in the loop, until revoked.
//
// Mechanics: `registerBackgroundPresence()` MUST run at app-root module scope
// (Expo requires the task defined before the app registers; a task defined
// inside a component never fires headlessly). `enableBackgroundPresence()`
// then asks for the "allow all the time" permission and arms a 250m geofence
// on the stored pin. ENTER stamps a timestamp; EXIT folds the span into
// per-day aggregates (background-math.ts) and flushes them. Only the derived
// day records ever leave the device — same contract as the foreground tier.
//
// The Android foreground-service tier (foreground-service.ts) rides the same
// registration call and the same stored enterAt, so the two never
// double-count a stay; see sampler.ts for the cooperation rule.
//
// expo-task-manager is an OPTIONAL module (the expo-file-system pattern): a
// host without it simply has no background tier, never a crash. It is listed
// as an optional peer, not a dependency — the host opts into the native
// surface by installing it.
// ---------------------------------------------------------------------------

import * as Location from 'expo-location';
import { withPromptWatch } from './os-prompt';
import { foldSpanIntoDays } from './background-math';
import { cancelCheckIns, defineCheckInTask, scheduleCheckIns } from './checkin';
import { defineLocationTask } from './foreground-service';
import { PRESENCE_GEOFENCE_TASK, armGeofence } from './geofence';
import { flushPendingObservations } from './flush';
import { mergeObservations } from './sampler';
import { loadPresencePin, presenceTokenFor } from './store';
import { registerPresenceDevice } from './device';
import {
  loadEnterAt,
  queueObservations,
  saveEnterAt,
  saveFenceUser,
  saveReporterConfig,
} from './background-store';
import { nativeModulePresent } from '../lib/native-module-present';
import { userTokenFor, type UserTokenProvider } from './user-token';
import './secure-token';

// Kept exported from here for hosts (and status.ts) that imported it before
// the primitive moved to geofence.ts.
export { PRESENCE_GEOFENCE_TASK };

interface TaskManagerLike {
  defineTask(name: string, fn: (body: { data: unknown; error: unknown }) => void): void;
  isTaskRegisteredAsync(name: string): Promise<boolean>;
  isTaskDefined?(name: string): boolean;
}

function taskManager(): TaskManagerLike | null {
  if (!nativeModulePresent('ExpoTaskManager')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-task-manager') as Partial<TaskManagerLike>;
    return typeof mod?.defineTask === 'function' ? (mod as TaskManagerLike) : null;
  } catch {
    return null;
  }
}


/**
 * Define the background tasks (the geofence task AND the foreground-service
 * location task). Call ONCE from the host app's root module (e.g. index.js),
 * before the component tree mounts. Returns false when the optional
 * expo-task-manager module is absent.
 */
export function registerBackgroundPresence(): boolean {
  const tm = taskManager();
  if (!tm) return false;
  tm.defineTask(PRESENCE_GEOFENCE_TASK, (body) => {
    if (body.error) return;
    const data = body.data as
      | { eventType?: number; region?: { identifier?: string } }
      | undefined;
    const userId = data?.region?.identifier;
    if (!userId) return;
    // expo-location: GeofencingEventType.Enter = 1, Exit = 2.
    if (data?.eventType === 1) {
      // A stay the foreground-service sampler already opened stays open;
      // re-stamping would shorten it.
      if (loadEnterAt(userId) == null) saveEnterAt(userId, Date.now());
      return;
    }
    if (data?.eventType === 2) {
      const enteredAt = loadEnterAt(userId);
      saveEnterAt(userId, null);
      if (enteredAt == null) return;
      const days = foldSpanIntoDays(enteredAt, Date.now());
      if (days.length === 0) return;
      queueObservations(
        userId,
        days.map((d) => ({ ...d, source: 'geofence' as const, samples: 1 })),
        mergeObservations,
      );
      void flushPendingObservations(userId);
    }
  });
  defineLocationTask(tm);
  defineCheckInTask(tm);
  return true;
}

/** Whether registerBackgroundPresence() ran at the app's root, so fence events have a handler. */
export function backgroundPresenceRegistered(): boolean {
  const tm = taskManager();
  if (!tm) return false;
  // Older expo-task-manager builds without isTaskDefined: assume defined, as before.
  if (typeof tm.isTaskDefined !== 'function') return true;
  try {
    return tm.isTaskDefined(PRESENCE_GEOFENCE_TASK);
  } catch {
    return false;
  }
}

export interface EnableBackgroundResult {
  enabled: boolean;
  reason:
    | 'enabled'
    | 'module_missing'
    /** registerBackgroundPresence() was never called at the app's root. */
    | 'not_registered'
    | 'no_pin'
    | 'foreground_denied'
    | 'background_denied'
    | 'start_failed';
  /** On a refusal: false when the OS answered without showing a prompt, which
   *  leaves Settings as the only way forward (os-prompt.ts). */
  osPrompted?: boolean;
}

/**
 * Arm the geofence on the stored pin. Asks for foreground THEN background
 * permission (the order the OSes require); a refusal leaves the foreground
 * tier working exactly as before — the tiers degrade, never break.
 */
export async function enableBackgroundPresence(options: {
  apiKey: string;
  externalUserId: string;
  devUrl?: string;
  /** With a scoped publishable key: see ReportPresenceOptions.getUserToken. */
  getUserToken?: UserTokenProvider;
}): Promise<EnableBackgroundResult> {
  const tm = taskManager();
  if (!tm) return { enabled: false, reason: 'module_missing' };
  // A fence with no task defined fires into nothing, and asking for the
  // "always" permission for it would cost the person a prompt for no benefit.
  if (!backgroundPresenceRegistered()) return { enabled: false, reason: 'not_registered' };
  const pin = loadPresencePin(options.externalUserId);
  if (!pin) return { enabled: false, reason: 'no_pin' };

  const fg = await withPromptWatch(
    () => Location.requestForegroundPermissionsAsync().catch(() => null),
    () => Location.getForegroundPermissionsAsync().catch(() => null),
  );
  if (fg.result?.status !== 'granted') {
    return { enabled: false, reason: 'foreground_denied', osPrompted: fg.prompted };
  }
  const bg = await withPromptWatch(
    () => Location.requestBackgroundPermissionsAsync().catch(() => null),
    () => Location.getBackgroundPermissionsAsync().catch(() => null),
  );
  if (bg.result?.status !== 'granted') {
    return { enabled: false, reason: 'background_denied', osPrompted: bg.prompted };
  }

  // The task handler runs with no React context, so the wire config it needs
  // to flush is persisted beside the pin. The key is publishable by design.
  saveReporterConfig(options.externalUserId, {
    apiKey: options.apiKey,
    ...(options.devUrl ? { devUrl: options.devUrl } : {}),
  });
  // A token now, kept for the headless flush (secure-token.ts). No provider:
  // nothing happens and the background posts as it always has.
  await userTokenFor({
    apiKey: options.apiKey,
    externalUserId: options.externalUserId,
    purpose: 'presence',
    ...(options.getUserToken ? { getUserToken: options.getUserToken } : {}),
  });

  try {
    await armGeofence(options.externalUserId, pin);
    saveFenceUser(options.externalUserId);
    // "Still here" check-ins (checkin.ts): best-effort, and only when the
    // host installed expo-background-task. Without them a stay is recorded
    // when the person leaves or opens the app.
    await scheduleCheckIns();
    // A later foreground registers a device the 202 could not (offline, or an
    // older SDK then). A registered phone answers without a mint.
    const held = await presenceTokenFor(options.externalUserId);
    if (held.token) {
      void registerPresenceDevice({
        apiKey: options.apiKey,
        externalUserId: options.externalUserId,
        presenceToken: held.token,
        ...(options.devUrl ? { devUrl: options.devUrl } : {}),
        ...(options.getUserToken ? { getUserToken: options.getUserToken } : {}),
      });
    }
    return { enabled: true, reason: 'enabled' };
  } catch {
    return { enabled: false, reason: 'start_failed' };
  }
}

/** Disarm the geofence. Never throws; a host may call it defensively. */
export async function disableBackgroundPresence(): Promise<void> {
  saveFenceUser(null);
  await cancelCheckIns();
  try {
    await Location.stopGeofencingAsync(PRESENCE_GEOFENCE_TASK);
  } catch {
    // Not armed, or the module is absent — either way, disarmed.
  }
}
