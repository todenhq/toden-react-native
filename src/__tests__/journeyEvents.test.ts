import { createVerificationApi, VerificationApiError } from '../services/api';
import { journeyClientOf, shortOsVersion, type ReactNativeDeviceMetadata } from '../services/deviceMetadata';
import { safeReportError } from '../services/errors';
import { VerificationError } from '../types/verification';
import { EmrtdSessionError } from '../emrtd/session';
import { nfcFailureDetail } from '../screens/nfc/readErrorMessage';
import { livenessFailureDetail } from '../lib/liveness-attempts';
import { captureRejectionDetail } from '../lib/documentCaptureCheck';
import {
  cameraErrorDetail,
  getStepLog,
  isNetworkFailure,
  journeyEventCount,
  networkErrorDetail,
  onJourneySaveNeeded,
  recordJourneyEvent,
  recordStep,
  resetStepLog,
  uploadDetail,
} from '../lib/step-log';
import { isUntouchedProgress, watchSessionProgress } from '../store/session';
import type { VerificationStore } from '../store/verificationStore';

// ─── Drop-off insights: what got in the way, on the step log ─────────────────
//
// The step log carries closed codes for what stopped the person (a refused
// camera, failed uploads, failed liveness attempts, leaving the app, Close),
// with the SDK and device, and the ones that may be the last thing they do are
// saved straight away. Never text the person typed: only codes.

const at = (ms: number) => new Date(Date.UTC(2026, 10, 20, 9, 0, 0) + ms);

describe('journey events on the step log', () => {
  beforeEach(() => resetStepLog());

  it('records a code on the step the person is on, with a closed detail', () => {
    recordStep('liveness');
    recordJourneyEvent('liveness_failed', 'no_face', at(0));
    expect(getStepLog()?.events).toEqual([{ code: 'liveness_failed', step: 'liveness', at: at(0).toISOString(), detail: 'no_face' }]);
  });

  it('drops a detail that is not a short closed code rather than sending it', () => {
    recordStep('consent');
    recordJourneyEvent('error_shown', 'Something went wrong for Ada', at(0));
    expect(getStepLog()?.events?.[0]).not.toHaveProperty('detail');
  });

  it('keeps the same thing on the same step inside two seconds as one event', () => {
    recordStep('document-capture');
    recordJourneyEvent('camera_denied', undefined, at(0));
    recordJourneyEvent('camera_denied', undefined, at(1500));
    recordJourneyEvent('camera_denied', undefined, at(2500));
    expect(journeyEventCount()).toBe(2);
    recordStep('liveness');
    recordJourneyEvent('camera_denied', undefined, at(2600));
    expect(journeyEventCount()).toBe(3);
  });

  it('forgets leaving the app for under a second: a permission sheet, not leaving', () => {
    recordStep('liveness');
    recordJourneyEvent('app_backgrounded', undefined, at(0));
    recordJourneyEvent('app_foregrounded', undefined, at(600));
    expect(journeyEventCount()).toBe(0);
    recordJourneyEvent('app_backgrounded', undefined, at(5000));
    recordJourneyEvent('app_foregrounded', undefined, at(9000));
    expect(getStepLog()?.events?.map((e) => e.code)).toEqual(['app_backgrounded', 'app_foregrounded']);
  });

  it('keeps the newest sixty, dropping the oldest', () => {
    recordStep('liveness');
    for (let i = 0; i < 70; i += 1) recordJourneyEvent('liveness_failed', 'no_face', at(i * 3000));
    const events = getStepLog()!.events!;
    expect(events).toHaveLength(60);
    expect(events[59]!.at).toBe(at(69 * 3000).toISOString());
  });

  it('rides the log with the SDK and device, and is cleared for the next session', () => {
    recordStep('consent');
    recordJourneyEvent('flow_closed', undefined, at(0));
    const log = getStepLog({ sdk: 'react-native', version: '4.2.0', platform: 'ios', os: 'iOS', osVersion: '18.1', formFactor: 'phone' });
    expect(log?.client).toEqual({ sdk: 'react-native', version: '4.2.0', platform: 'ios', os: 'iOS', osVersion: '18.1', formFactor: 'phone' });
    resetStepLog();
    expect(getStepLog()).toBeNull();
  });
});

describe('which events are saved straight away', () => {
  let saves = 0;
  let stop: () => void = () => undefined;
  beforeEach(() => {
    resetStepLog();
    recordStep('liveness');
    saves = 0;
    stop = onJourneySaveNeeded(() => {
      saves += 1;
    });
  });
  afterEach(() => stop());

  it('saves at once what may be the last thing the person does', () => {
    recordJourneyEvent('camera_denied', undefined, at(0));
    recordJourneyEvent('camera_unavailable', 'in_use', at(10_000));
    recordJourneyEvent('upload_failed', 'selfie', at(20_000));
    recordJourneyEvent('app_backgrounded', undefined, at(30_000));
    recordJourneyEvent('flow_closed', undefined, at(40_000));
    expect(saves).toBe(5);
  });

  it('saves a failed attempt from the second on: one failure is ordinary', () => {
    recordJourneyEvent('liveness_failed', 'no_face', at(0));
    expect(saves).toBe(0);
    recordJourneyEvent('liveness_failed', 'timeout', at(10_000));
    expect(saves).toBe(1);
  });

  it('never saves a network error at once: the next save carries it', () => {
    recordJourneyEvent('network_error', 'other', at(0));
    recordJourneyEvent('code_resent', 'email', at(10_000));
    expect(saves).toBe(0);
  });

  it('never lets a failing listener reach the person', () => {
    const off = onJourneySaveNeeded(() => {
      throw new Error('boom');
    });
    expect(() => recordJourneyEvent('flow_closed', undefined, at(0))).not.toThrow();
    off();
  });
});

describe('the closed details', () => {
  it('names an upload by what it carried', () => {
    expect(uploadDetail('document_front')).toBe('document');
    expect(uploadDetail('document_back_video')).toBe('video');
    expect(uploadDetail('liveness_video')).toBe('video');
    expect(uploadDetail('selfie')).toBe('selfie');
    expect(uploadDetail('signature')).toBe('supporting_document');
    expect(uploadDetail('proof_of_address')).toBe('proof_of_address');
    expect(uploadDetail('address_photo')).toBe('other');
  });

  it('tells a camera another app holds from any other failure', () => {
    expect(cameraErrorDetail(new Error('The camera is in use by another app'))).toBe('in_use');
    expect(cameraErrorDetail({ code: 'device/camera-already-in-use' })).toBe('in_use');
    expect(cameraErrorDetail(new Error('session/configuration-failed'))).toBe('other');
  });

  it('counts the network failing, never the SDK cancelling its own request', () => {
    const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    expect(isNetworkFailure(abort)).toBe(false);
    expect(isNetworkFailure(new TypeError('Network request failed'))).toBe(true);
    expect(networkErrorDetail(new TypeError('The request timed out.'))).toBe('timeout');
    expect(networkErrorDetail(new TypeError('Network request failed'))).toBe('other');
  });

  it('names a failed chip read without the platform string, and not a dismissed sheet', () => {
    expect(nfcFailureDetail(new Error('Error Domain=NFCError Code=200 "Session invalidated by user"'))).toBeNull();
    expect(nfcFailureDetail(new Error('Error Domain=NFCError Code=201 "timeout"'))).toBe('timeout');
    expect(nfcFailureDetail(new Error('Tag was lost.'))).toBe('read_error');
    expect(nfcFailureDetail(new EmrtdSessionError('x', 'bac_failed'))).toBe('access_denied');
    expect(nfcFailureDetail(new EmrtdSessionError('x', 'select_failed'))).toBe('not_supported');
    expect(nfcFailureDetail(new Error('weird'))).toBe('other');
  });

  it('names a failed liveness check and a rejected document photo', () => {
    expect(livenessFailureDetail('face_lost')).toBe('no_face');
    expect(livenessFailureDetail('face_swap')).toBe('face_changed');
    expect(livenessFailureDetail('timeout')).toBe('timeout');
    expect(livenessFailureDetail('flash_failed')).toBe('other');
    expect(captureRejectionDetail('not_complete')).toBe('cut_off');
    expect(captureRejectionDetail('no_barcode')).toBe('other');
  });
});

describe('the SDK and device on the log', () => {
  it('keeps the OS version to major.minor, and names the form factor', () => {
    expect(shortOsVersion('17.5.1')).toBe('17.5');
    expect(shortOsVersion('16')).toBe('16');
    expect(shortOsVersion(undefined)).toBeUndefined();
    const meta = {
      sdkType: 'react-native',
      sdkVersion: '4.2.0',
      device: { type: 'tablet' },
      os: { name: 'iPadOS', version: '18.2.1' },
    } as unknown as ReactNativeDeviceMetadata;
    expect(journeyClientOf(meta)).toMatchObject({ sdk: 'react-native', os: 'iPadOS', osVersion: '18.2', formFactor: 'tablet' });
  });
});

describe('error screens', () => {
  beforeEach(() => {
    resetStepLog();
    recordStep('submitted');
  });

  it('records what the person was shown, by code, even without a listener', () => {
    safeReportError(undefined, new VerificationError('session_cancelled', 'This verification was cancelled.'));
    expect(getStepLog()?.events?.[0]).toMatchObject({ code: 'error_shown', detail: 'session_cancelled' });
  });

  it('leaves out what another event already says', () => {
    safeReportError(undefined, new VerificationError('upload_failed', 'x'));
    safeReportError(undefined, new VerificationError('camera_permission_denied', 'x'));
    expect(getStepLog()?.events).toBeUndefined();
  });
});

describe('network failures in the API client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  beforeEach(() => {
    resetStepLog();
    recordStep('document-capture');
  });

  it('records a request that never got an answer, and rethrows it untouched', async () => {
    const failure = new TypeError('Network request failed');
    global.fetch = jest.fn(async () => {
      throw failure;
    }) as unknown as typeof fetch;
    const api = createVerificationApi('https://api.example.test', 'pk_test_x');
    await expect(api.status('ver_1')).rejects.toBe(failure);
    expect(getStepLog()?.events?.[0]).toMatchObject({ code: 'network_error', detail: 'other', step: 'document-capture' });
  });

  it('never records a failing progress save, nor a request the SDK cancelled', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const api = createVerificationApi('https://api.example.test', 'pk_test_x');
    await expect(api.saveProgress('ses_1', {})).rejects.toBeInstanceOf(TypeError);
    global.fetch = jest.fn(async () => {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }) as unknown as typeof fetch;
    await expect(api.status('ver_1')).rejects.toBeInstanceOf(Error);
    expect(getStepLog()?.events).toBeUndefined();
  });

  it('still lets a refusal through as before', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 404 })) as unknown as typeof fetch;
    const api = createVerificationApi('https://api.example.test', 'pk_test_x');
    await expect(api.status('ver_1')).rejects.toBeInstanceOf(VerificationApiError);
    expect(getStepLog()?.events).toBeUndefined();
  });
});

describe('saving the journey to the session', () => {
  /** A store as small as the watcher reads: the fields progressFromState and openingStep use. */
  function fakeStore(sessionId: string, saved: Array<{ sessionId: string; body: Record<string, unknown> }>) {
    const state = {
      sessionId,
      cancelled: null,
      declined: null,
      currentStep: 'consent',
      mediaIds: {},
      supportingDocuments: [],
      api: {
        saveProgress: jest.fn(async (id: string, body: Record<string, unknown>) => {
          saved.push({ sessionId: id, body });
        }),
      },
    };
    return {
      getState: () => state,
      subscribe: () => () => undefined,
    } as unknown as VerificationStore;
  }

  beforeEach(() => resetStepLog());

  it('saves at once when the person closes on the opening screen, which is otherwise never saved', () => {
    const saved: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    const derive = jest.requireActual('../store/derive') as { openingStep: unknown };
    jest.spyOn(derive as { openingStep: () => string }, 'openingStep').mockReturnValue('consent');
    const stop = watchSessionProgress(fakeStore('ses_a', saved));
    recordStep('consent');
    recordJourneyEvent('flow_closed', undefined, at(0));
    stop();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.sessionId).toBe('ses_a');
    const log = saved[0]!.body['stepLog'] as { events?: Array<{ code: string }>; client?: { sdk: string } };
    expect(log.events?.map((e) => e.code)).toEqual(['flow_closed']);
    expect(log.client?.sdk).toBe('react-native');
  });

  it('hands the listener to the newest flow: an old store never saves the next session', () => {
    const saved: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    const derive = jest.requireActual('../store/derive') as { openingStep: unknown };
    jest.spyOn(derive as { openingStep: () => string }, 'openingStep').mockReturnValue('consent');
    watchSessionProgress(fakeStore('ses_old', saved));
    const stop = watchSessionProgress(fakeStore('ses_new', saved));
    recordStep('liveness');
    recordJourneyEvent('camera_denied', undefined, at(0));
    stop();
    expect(saved.map((s) => s.sessionId)).toEqual(['ses_new']);
  });

  it('treats an opening screen with something in its way as touched', () => {
    expect(isUntouchedProgress({ step: 'consent', mediaIds: {}, stepLog: { events: [] } })).toBe(true);
    expect(isUntouchedProgress({ step: 'consent', mediaIds: {}, stepLog: { events: [{ code: 'flow_closed' }] } })).toBe(false);
  });
});
