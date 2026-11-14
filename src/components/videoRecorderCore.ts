import { markRecordingStart } from '../liveness/flashTimeline';

// The recorder behind useVideoRecorder, without React, so it can be tested
// (videoRecorderCore.test.ts).
//
// Each start() is its own TAKE, and a take's callbacks only ever touch that
// take. The file path arrives through onRecordingFinished, which iOS calls once
// the AVAssetWriter has finished writing; stop() waits for it only so long. A
// path that came later used to be written into the recorder's SHARED state and
// resolve whichever wait was current by then, so on a document the front's
// late file became the back's recording: one camera stays open across the
// turn-over, so the back's take had already started when the front's file
// arrived. Now a late file only reaches the take that recorded it.

/** The part of VisionCamera's Recorder this uses. */
export interface RecorderLike {
  startRecording: (onFinished: (filePath: string) => void, onError: (error: unknown) => void) => Promise<void>;
  stopRecording: () => Promise<void>;
}

export interface RecorderSource {
  createRecorder: (settings: Record<string, never>) => Promise<RecorderLike>;
}

export interface VideoRecorderHandle {
  /** Start recording (no-op if disabled or already recording). */
  start: () => void;
  /** Stop and resolve the recorded `file://` path, or null if nothing recorded. */
  stop: () => Promise<string | null>;
  /** True while a recording is in progress. */
  isRecording: () => boolean;
  /**
   * Why the last recording produced no file, once stop() has answered null:
   * it never started, or it started and produced nothing.
   */
  failure: () => 'recorder_start_failed' | 'recording_empty' | null;
}

export interface VideoRecorderTimings {
  /** Hard length cap: the recording stops by itself after this long. */
  maxDurationMs: number;
  /** How long stop() waits for the finished file. */
  finishWaitMs?: number;
  /** Start attempts while the output is not yet connected to the session. */
  startAttempts?: number;
  startRetryMs?: number;
}

interface Take {
  /** Between start() and stop(), or until the recording fails. */
  live: boolean;
  recorder: RecorderLike | null;
  /** The recorder went live. */
  started: boolean;
  stopping: boolean;
  path: string | null;
  finished: Promise<string | null>;
  resolve: (path: string | null) => void;
  autoStop: ReturnType<typeof setTimeout> | null;
}

function newTake(): Take {
  let resolve: (path: string | null) => void = () => undefined;
  const finished = new Promise<string | null>((r) => {
    resolve = r;
  });
  return { live: true, recorder: null, started: false, stopping: false, path: null, finished, resolve, autoStop: null };
}

export function createVideoRecorder(
  source: () => RecorderSource,
  enabled: () => boolean,
  timings: VideoRecorderTimings,
): VideoRecorderHandle {
  const finishWaitMs = timings.finishWaitMs ?? 2000;
  const startAttempts = timings.startAttempts ?? 12;
  const startRetryMs = timings.startRetryMs ?? 200;
  let current: Take | null = null;

  const start = () => {
    if (current?.live || !enabled()) return;
    const take = newTake();
    current = take;
    const output = source();
    void (async () => {
      const onFinished = (filePath: string) => {
        take.path = `file://${filePath}`;
        take.resolve(take.path);
      };
      const onError = () => {
        take.live = false;
        take.recorder = null;
        take.resolve(null);
      };
      // No recording yet: a time left by an earlier one (a document video) must
      // never date this one's flash, should this recorder fail to start.
      markRecordingStart(null);
      // Retry until the video output is connected to the session (~2.4s); the
      // "not yet connected" error is transient. Any other error → bail (best-effort).
      for (let attempt = 0; attempt < startAttempts; attempt++) {
        if (!take.live) return; // stopped before it ever started
        try {
          const recorder = await output.createRecorder({});
          await recorder.startRecording(onFinished, onError);
          take.recorder = recorder;
          take.started = true;
          // The flash reports its colours' times from here (liveness/flashTimeline.ts).
          markRecordingStart(Date.now());
          // Hard length cap — stop the recording (path arrives via onFinished); a
          // later stop() will just await the already-resolved path.
          take.autoStop = setTimeout(() => {
            if (take.recorder && !take.stopping) {
              take.stopping = true;
              void take.recorder.stopRecording().catch(() => {});
            }
          }, timings.maxDurationMs);
          return; // recording is live
        } catch (e) {
          const msg = String(e);
          if (msg.includes('not yet connected') || msg.includes('CameraSession')) {
            await new Promise((r) => setTimeout(r, startRetryMs));
            continue;
          }
          break;
        }
      }
      take.live = false;
      take.recorder = null;
      take.resolve(null);
    })();
  };

  const stop = async (): Promise<string | null> => {
    const take = current;
    if (!take) return null;
    if (take.autoStop) {
      clearTimeout(take.autoStop);
      take.autoStop = null;
    }
    if (!take.live) return take.path;
    if (!take.recorder) {
      // Still in the start-retry loop (output not connected yet) — cancel it.
      take.live = false;
      return take.path;
    }
    if (!take.stopping) {
      take.stopping = true;
      try {
        await take.recorder.stopRecording();
      } catch {
        /* already stopping / not started — fall through to the path wait */
      }
    }
    // The final path arrives via onRecordingFinished; bound the wait.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const path = await Promise.race([
      take.finished,
      new Promise<string | null>((resolve) => {
        timer = setTimeout(() => resolve(take.path), finishWaitMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    take.live = false;
    take.recorder = null;
    return path;
  };

  const isRecording = () => !!current?.live;

  const failure = () => {
    const take = current;
    if (!take || take.path) return null;
    return take.started ? ('recording_empty' as const) : ('recorder_start_failed' as const);
  };

  return { start, stop, isRecording, failure };
}
