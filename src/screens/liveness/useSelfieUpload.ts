import { useCallback, useRef, useState } from 'react';

import { MAX_VIDEO_BYTES } from '../../config/captureSettings';
import { compressVideo } from '../../services/mediaCompress';
import { fileSha256 } from '../../liveness/signedCapture';
import { withRetry } from '../../services/retry';
import { mapToVerificationError, safeReportError } from '../../services/errors';
import { declinedRefusalOf } from '../../lib/session-declined';
import { useFlowState, useVerificationConfig } from '../../components/runtime';
import { useToast } from '../../components/toast';
import { recordUploadFailure } from '../../lib/step-log';

// ---------------------------------------------------------------------------
// The selfie and its liveness video, uploaded as soon as they exist.
//
// Split out of LivenessStep (200-line rule). It is a genuine boundary, not a
// slice for size: everything here is about getting two files to the server and
// reporting how that went, and none of it touches the camera or the state
// machine.
//
// The two uploads are deliberately NOT equal. The selfie is the verification —
// its failure is surfaced, retried and reported. The video is supporting
// evidence the server re-scores, so a failure there is swallowed: losing it must
// never block a user who has already done everything asked of them.
// ---------------------------------------------------------------------------

export interface SelfieUpload {
  selfieUri: string | null;
  setSelfieUri: (uri: string | null) => void;
  uploading: boolean;
  /** Which retry attempt is in flight, for the "retrying (2/3)" line. */
  retryInfo: { attempt: number; total: number } | null;
  uploadError: string | null;
  setUploadError: (message: string | null) => void;
  /** The uploaded selfie's media id — Continue is gated on it. */
  selfieIdRef: React.MutableRefObject<string | null>;
  /**
   * The finished liveness-video path, kept so the review screen's "Try Again"
   * can re-upload it. The recorder itself lives in useVideoRecorder.
   */
  videoPathRef: React.MutableRefObject<string | null>;
  /**
   * The selfie's depth frame (liveness/depthFrame.ts), kept like the video
   * path so a re-upload sends it too. Null where there is none: Android, the
   * web, a phone without a Face ID camera.
   */
  depthPathRef: React.MutableRefObject<string | null>;
  /** `recorderFailure`: why the recorder produced no file, when it did not. */
  uploadSelfieAndVideo: (
    selfie: string,
    videoPath: string | null,
    recorderFailure?: 'recorder_start_failed' | 'recording_empty' | null,
  ) => Promise<void>;
}

export function useSelfieUpload(): SelfieUpload {
  const toast = useToast();
  const config = useVerificationConfig();
  const api = useFlowState((s) => s.api);
  const setMediaId = useFlowState((s) => s.setMediaId);
  const clearMediaIds = useFlowState((s) => s.clearMediaIds);
  const setSelfiePreview = useFlowState((s) => s.setSelfiePreview);
  // The store-side progress report. The liveness step may hand over before
  // the upload lands (the biometric scopes hide the review), so the submitted
  // step waits on THIS rather than on this hook's local state.
  const setSelfieUpload = useFlowState((s) => s.setSelfieUpload);
  const setLivenessVideoReport = useFlowState((s) => s.setLivenessVideoReport);
  const setUploadSha256 = useFlowState((s) => s.setUploadSha256);
  const storedPreview = useFlowState((s) => s.selfiePreviewUri);
  const storedSelfieId = useFlowState((s) => s.mediaIds.selfie);
  const storedUpload = useFlowState((s) => s.selfieUpload);

  // Hydrated from the STORE so leaving the step and returning lands on the
  // review screen with the same selfie, exactly as document captures do. The
  // setter writes through, keeping the store the source of truth.
  const [selfieUri, setSelfieUriState] = useState<string | null>(storedPreview);
  const setSelfieUri = useCallback(
    (uri: string | null) => {
      setSelfieUriState(uri);
      setSelfiePreview(uri);
    },
    [setSelfiePreview],
  );
  const [uploading, setUploading] = useState(false);
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const selfieIdRef = useRef<string | null>(storedSelfieId ?? null);
  const videoPathRef = useRef<string | null>(null);
  const depthPathRef = useRef<string | null>(null);
  // An upload begun on an EARLIER visit to the step keeps running after the
  // step unmounts (the step hands over without waiting for it) and reports to
  // the store. Coming back mid-flight, this hook's own state is fresh, so the
  // step read "nothing uploaded, nothing uploading" and began the same upload
  // again from the start. The store's report is the truth across visits: adopt
  // the id when it lands, and count that upload as in flight until it does.
  if (storedSelfieId && !selfieIdRef.current) selfieIdRef.current = storedSelfieId;
  const uploadingElsewhere =
    !uploading && storedUpload.status === 'uploading' && !selfieIdRef.current;

  const uploadSelfieAndVideo = useCallback(
    async (
      selfie: string,
      videoPath: string | null,
      recorderFailure?: 'recorder_start_failed' | 'recording_empty' | null,
    ) => {
      setUploading(true);
      setUploadError(null);
      setRetryInfo(null);
      setSelfieUpload({ status: 'uploading', message: null });
      const onRetry = (attempt: number, total: number) => setRetryInfo({ attempt, total });
      // The signed capture covers the exact bytes each upload sends: the file
      // at the URI the upload reads, hashed while it goes and recorded under
      // the id it gets (liveness/signedCapture.ts). Never throws; a file that
      // cannot be hashed is simply left out of the proof.
      const recordHash = async (mediaId: string, hashing: Promise<string | undefined>) => {
        const sha256 = await hashing;
        if (sha256) setUploadSha256(mediaId, sha256);
      };
      try {
        const selfieHash = fileSha256(selfie);
        const selfieId = await withRetry(
          () => api.upload({ uri: selfie, type: 'image/jpeg' }, 'selfie'),
          { onRetry },
        );
        await recordHash(selfieId, selfieHash);
        selfieIdRef.current = selfieId;
        setMediaId('selfie', selfieId);
        // The depth frame is evidence Core records, never a gate: a failure
        // here is swallowed and the submission simply goes without it. It is
        // a few hundred KB, so it goes before the much larger video. It
        // belongs to the one still it was read from, so an earlier selfie's
        // is dropped first and never rides beside this one.
        clearMediaIds(['livenessDepth']);
        const depthPath = depthPathRef.current;
        if (depthPath) {
          try {
            const depthHash = fileSha256(depthPath);
            const depthId = await withRetry(() => api.upload({ uri: depthPath, type: 'image/png' }, 'liveness_depth'));
            await recordHash(depthId, depthHash);
            setMediaId('livenessDepth', depthId);
          } catch {
            // Best-effort; see above.
          }
        }
        // Liveness video is best-effort — a failure here must not block the
        // user. What happened to it IS reported: the server records a missing
        // recording as a finding, and the cause is what makes it actionable.
        if (videoPath) {
          const small = await compressVideo(videoPath);
          if (!small) {
            setLivenessVideoReport({ recorded: false, failure: 'compression_failed' });
          } else {
            try {
              const videoHash = fileSha256(small);
              const videoId = await withRetry(
                () => api.upload({ uri: small, type: 'video/mp4' }, 'liveness_video', MAX_VIDEO_BYTES),
                { onRetry },
              );
              await recordHash(videoId, videoHash);
              setMediaId('livenessVideo', videoId);
              setLivenessVideoReport({ recorded: true });
            } catch {
              recordUploadFailure('liveness_video');
              setLivenessVideoReport({ recorded: false, failure: 'upload_failed' });
            }
          }
        } else if (recorderFailure !== undefined) {
          // The first upload after a capture (a re-upload leaves the report the
          // capture already made).
          setLivenessVideoReport({ recorded: false, failure: recorderFailure ?? 'recording_missing' });
        }
        setRetryInfo(null);
        setUploading(false);
        setSelfieUpload({ status: 'done', message: null });
      } catch (err) {
        setRetryInfo(null);
        setUploading(false);
        // A declined session ends the flow on its own screen (the API client
        // marked it), which reports onError once: no toast, no second report.
        if (declinedRefusalOf(err)) return;
        recordUploadFailure('selfie');
        const verificationError = mapToVerificationError(err, 'upload');
        setUploadError(verificationError.message);
        setSelfieUpload({ status: 'failed', message: verificationError.message });
        toast.show({ variant: 'error', title: 'Upload failed', message: verificationError.message });
        safeReportError(config.onError, verificationError);
      }
    },
    [api, setMediaId, clearMediaIds, setUploadSha256, setSelfieUpload, setLivenessVideoReport, config.onError, toast],
  );

  return {
    selfieUri,
    setSelfieUri,
    uploading: uploading || uploadingElsewhere,
    retryInfo,
    uploadError,
    setUploadError,
    selfieIdRef,
    videoPathRef,
    depthPathRef,
    uploadSelfieAndVideo,
  };
}
