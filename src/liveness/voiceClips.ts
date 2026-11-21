// ---------------------------------------------------------------------------
// Toden voice clips for the liveness prompts: fetch the manifest, cache the
// chosen voice's clips on the device, and play one when its text comes up.
//
// Everything here is best-effort. A missing native module, a manifest that
// does not answer in 3 s (or answers 404 while the switch is off), a clip that
// will not download or load: each leaves that phrase, or every phrase, to the
// device voice. Contract: kyc-core docs/VOICE_GUIDANCE.md.
//
// The download starts as soon as the flow knows its voice (voicePreload.ts,
// when the SDK resolves its workflow), not when the liveness step opens: a
// person heard the device voice say the first prompts, then the Toden voice
// once its clips had landed (2026-11-20). The step reuses that download
// (preloadVoiceClips), and a phrase whose clip is still on its way waits for it
// a moment (speech.ts, CLIP_GRACE_MS) before the device voice takes over.
//
// expo-audio and expo-file-system are loaded lazily, the SDK's optional-module
// pattern (lib/native-module-present.ts): an app that updated the SDK without
// rebuilding has no ExpoAudio in its binary, and must keep the device voice
// rather than close.
// ---------------------------------------------------------------------------

import type * as ExpoAudio from 'expo-audio';
import type * as ExpoFileSystem from 'expo-file-system';

import { primaryLanguage } from '../config/voiceGuidance';
import { nativeModulePresent } from '../lib/native-module-present';
import {
  manifestHasVoice,
  normalisePhrase,
  parseVoiceManifest,
  phraseKeyMap,
  pickVoice,
  voiceClipUrl,
  voiceManifestUrl,
  type VoiceApplicant,
  type VoiceManifest,
} from './voicePhrases';

type AudioModule = Pick<typeof ExpoAudio, 'createAudioPlayer' | 'setAudioModeAsync'>;
type AudioPlayer = ExpoAudio.AudioPlayer;
type FileSystemModule = Pick<typeof ExpoFileSystem, 'Directory' | 'File' | 'Paths'>;

export const VOICE_MANIFEST_TIMEOUT_MS = 3000;

/** Under the OS cache folder, so the system may clear it when space runs low. */
const CACHE_FOLDER = 'toden-voices';

function loadAudioModule(): AudioModule | null {
  try {
    if (!nativeModulePresent('ExpoAudio')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-audio') as Partial<AudioModule>;
    return mod?.createAudioPlayer && mod?.setAudioModeAsync ? (mod as AudioModule) : null;
  } catch {
    return null;
  }
}

function loadFileSystem(): FileSystemModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-file-system') as Partial<FileSystemModule>;
    return mod?.File && mod?.Directory && mod?.Paths ? (mod as FileSystemModule) : null;
  } catch {
    return null;
  }
}

/** The manifest, or null on any failure (network, timeout, 404, a body that is not one). */
export async function fetchVoiceManifest(
  server: string,
  timeoutMs: number = VOICE_MANIFEST_TIMEOUT_MS,
): Promise<VoiceManifest | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(voiceManifestUrl(server), { signal: controller.signal });
    if (!res.ok) return null;
    return parseVoiceManifest(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The clip as a local file, downloaded once. Clip URLs carry the manifest's
 * version and never change, so a file already in the cache is current.
 * A non-2xx answer rejects and leaves no file behind.
 */
async function cachedClipUri(fs: FileSystemModule, url: string, path: string[]): Promise<string> {
  const folders = path.slice(0, -1);
  const name = path[path.length - 1]!;
  const dir = new fs.Directory(fs.Paths.cache, CACHE_FOLDER, ...folders);
  const file = new fs.File(dir, name);
  if (file.exists) return file.uri;
  dir.create({ intermediates: true, idempotent: true });
  const downloaded = await fs.File.downloadFileAsync(url, file, { idempotent: true });
  return downloaded.uri;
}

export interface VoiceClipSource {
  /** Toden's API origin, as the rest of the SDK resolves it. */
  server: string;
  /** The workflow's own Toden voice, e.g. `lyra`: who speaks when the person's country and its neighbours have none. */
  voice?: string;
  /** BCP-47 tag; clips are chosen by its primary subtag. */
  language: string;
  /** Who the prompts are for; the voice is chosen from them once the manifest is in (pickVoice). */
  applicant?: VoiceApplicant;
}

type LoadState = 'loading' | 'ready' | 'failed';

/**
 * One voice's clips being fetched to the device: the manifest, then every clip
 * of the voice and language into the cache folder. Shared by the flow's early
 * preload and the liveness step, so nothing is fetched twice. Never rejects.
 */
export class VoiceDownload {
  /** Settles when the manifest and every clip have landed or failed. */
  readonly done: Promise<void>;
  private manifestState: LoadState = 'loading';
  private keys = new Map<string, string>();
  private readonly uris = new Map<string, string>();
  private readonly failed = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private finished = false;

  constructor(fs: FileSystemModule, source: VoiceClipSource, onManifestFailed: () => void) {
    this.done = this.run(fs, source, onManifestFailed)
      .catch(() => {
        if (this.manifestState === 'loading') this.manifestState = 'failed';
      })
      .finally(() => {
        this.finished = true;
        this.changed();
      });
  }

  /** Whether everything has landed or failed. */
  get settled(): boolean {
    return this.finished;
  }

  /** The manifest: still coming, in hand with the voice and language, or none to use. */
  get manifest(): LoadState {
    return this.manifestState;
  }

  /** Normalised phrase text to clip key, once the manifest is in. */
  get keysByText(): ReadonlyMap<string, string> {
    return this.keys;
  }

  /** The local file of a clip that has landed. */
  uri(key: string): string | undefined {
    return this.uris.get(key);
  }

  /** A clip: still downloading, on the device, or not to be had. */
  clip(key: string): LoadState {
    if (this.uris.has(key)) return 'ready';
    if (this.failed.has(key) || this.finished || this.manifestState === 'failed') return 'failed';
    return 'loading';
  }

  /** Told whenever the manifest or a clip settles. Returns the unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        /* a listener's failure is its own */
      }
    }
  }

  private async run(fs: FileSystemModule, source: VoiceClipSource, onManifestFailed: () => void): Promise<void> {
    const { server, language } = source;
    const manifest = await fetchVoiceManifest(server);
    const lang = primaryLanguage(language);
    // Only now is it known who speaks: the manifest says which voices are whose.
    const voice = manifest ? pickVoice(manifest, source) : null;
    if (!manifest || !voice || !manifestHasVoice(manifest, voice, lang)) {
      this.manifestState = 'failed';
      onManifestFailed();
      this.changed();
      return;
    }
    this.keys = phraseKeyMap(manifest, lang);
    this.manifestState = 'ready';
    this.changed();
    const keys = Object.keys(manifest.phrases[lang] ?? {});
    await Promise.all(
      keys.map(async (key) => {
        try {
          const uri = await cachedClipUri(fs, voiceClipUrl(server, manifest, voice, lang, key), [manifest.version, voice, lang, `${key}.mp3`]);
          this.uris.set(key, uri);
        } catch {
          // This phrase stays on the device voice.
          this.failed.add(key);
        }
        this.changed();
      }),
    );
  }
}

const downloads = new Map<string, VoiceDownload>();

const downloadKey = (source: VoiceClipSource) => {
  const who = source.applicant;
  const applicant = who ? `${who.choice}:${who.country?.toUpperCase() ?? ''}:${who.seed}:${who.neighbours !== false}` : '';
  return `${source.server}|${source.voice ?? ''}|${primaryLanguage(source.language)}|${applicant}`;
};

/**
 * Starts fetching a voice's clips to the device, in the background, or joins
 * the download already under way for the same server, voice and language.
 * `fresh` (the flow starting) fetches the manifest again once an earlier
 * download has settled, so clips Toden has changed since are picked up. A
 * manifest that could not be had is forgotten, so the next call tries again.
 * Null where the app has no expo-audio or expo-file-system: nothing to play.
 */
export function preloadVoiceClips(source: VoiceClipSource, options: { fresh?: boolean } = {}): VoiceDownload | null {
  if (!loadAudioModule()) return null;
  const fs = loadFileSystem();
  if (!fs) return null;
  const key = downloadKey(source);
  const existing = downloads.get(key);
  if (existing && !(options.fresh && existing.settled)) return existing;
  const download: VoiceDownload = new VoiceDownload(fs, source, () => {
    if (downloads.get(key) === download) downloads.delete(key);
  });
  downloads.set(key, download);
  return download;
}

/** Forgets every download (tests). */
export function forgetVoiceDownloads(): void {
  downloads.clear();
}

/**
 * One liveness session's clips. Load once, play many, release when the step
 * closes. The files come from the shared download (preloadVoiceClips), usually
 * well under way by the time the step opens.
 *
 * ONE player plays them all, swapping the file per phrase. A prepared player
 * per clip would hold 24 decoders and, on Android, 24 ExoPlayer threads beside
 * a camera that is recording; a local file starts within a few tens of
 * milliseconds of the swap.
 */
export class VoiceClips {
  private download: VoiceDownload | null = null;
  private unsubscribe: (() => void) | null = null;
  private audio: AudioModule | null = null;
  private player: AudioPlayer | null = null;
  private loading: Promise<void> | null = null;
  private playing = false;
  /** Told when the clip playing reaches its end. */
  private onFinished: (() => void) | null = null;
  private released = false;
  private recordsAudio: boolean | null = null;
  private sessionFor: boolean | null = null;

  /** Starts loading (once), joining the flow's download when there is one. The promise never rejects. */
  load(source: VoiceClipSource): Promise<void> {
    if (this.loading) return this.loading;
    this.audio = loadAudioModule();
    this.download = this.audio ? preloadVoiceClips(source) : null;
    const download = this.download;
    if (!download) {
      this.loading = Promise.resolve();
      return this.loading;
    }
    this.unsubscribe = download.onChange(() => this.clipsChanged());
    this.clipsChanged();
    this.loading = download.done;
    return this.loading;
  }

  /**
   * How the audio session must sit beside the camera: recording sound or not.
   * Applied once a clip exists, so a session with no clips never touches it.
   */
  setRecordsAudio(recordsAudio: boolean): void {
    this.recordsAudio = recordsAudio;
    this.applyAudioSession();
  }

  /**
   * Plays the clip for `text` when it has loaded, calling `onFinished` when it
   * reaches its end (not when stopped). False means "use the device voice".
   */
  play(text: string, onFinished?: () => void): boolean {
    const uri = this.uriFor(text);
    if (!uri || !this.ensurePlayer()) return false;
    const player = this.player!;
    try {
      player.replace({ uri });
      player.play();
      this.playing = true;
      this.onFinished = onFinished ?? null;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Whether `text` may yet have a clip: the manifest is still coming, or the
   * phrase has a clip still downloading. False once it plays, has no clip, or
   * its clip (or the manifest) could not be had.
   */
  pending(text: string): boolean {
    const download = this.download;
    if (this.released || !download) return false;
    if (download.manifest === 'loading') return true;
    if (download.manifest === 'failed') return false;
    const key = download.keysByText.get(normalisePhrase(text));
    return key !== undefined && download.clip(key) === 'loading';
  }

  /** Resolves once `text` is no longer pending, or after `timeoutMs`, whichever comes first. Never rejects. */
  waitFor(text: string, timeoutMs: number): Promise<void> {
    const download = this.download;
    if (!download || !this.pending(text)) return Promise.resolve();
    return new Promise((resolve) => {
      let stopListening: () => void = () => undefined;
      const timer = setTimeout(() => {
        stopListening();
        resolve();
      }, timeoutMs);
      stopListening = download.onChange(() => {
        if (this.pending(text)) return;
        clearTimeout(timer);
        stopListening();
        resolve();
      });
    });
  }

  /** Stops the clip playing, if any. Its `onFinished` is not called. */
  stop(): void {
    this.onFinished = null;
    if (!this.playing) return;
    this.playing = false;
    try {
      this.player?.pause();
    } catch {
      /* a released or broken player has nothing left to stop */
    }
  }

  /** Stops and frees the player. The shared download carries on into the cache. */
  release(): void {
    this.released = true;
    this.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    try {
      this.player?.remove();
    } catch {
      /* already gone */
    }
    this.player = null;
    this.download = null;
  }

  private uriFor(text: string): string | undefined {
    const download = this.download;
    if (this.released || !download) return undefined;
    const key = download.keysByText.get(normalisePhrase(text));
    return key === undefined ? undefined : download.uri(key);
  }

  /** A clip landed: the player and the audio session come with the first one. */
  private clipsChanged(): void {
    const download = this.download;
    if (this.released || !download) return;
    const any = [...download.keysByText.values()].some((key) => download.uri(key) !== undefined);
    if (!any || !this.ensurePlayer()) return;
    this.applyAudioSession();
  }

  /** The one player, made with the first clip. False when it cannot be made. */
  private ensurePlayer(): boolean {
    if (this.player) return true;
    if (!this.audio) return false;
    // keepAudioSessionActive: without it expo-audio deactivates the shared
    // iOS session after every clip, which would cut into the camera's
    // recording of sound.
    this.player = this.audio.createAudioPlayer(null, { keepAudioSessionActive: true });
    this.player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) this.clipFinished();
    });
    return true;
  }

  private clipFinished(): void {
    if (!this.playing) return;
    this.playing = false;
    const onFinished = this.onFinished;
    this.onFinished = null;
    onFinished?.();
  }

  /**
   * iOS: play beside the running camera, and beside the microphone when the
   * liveness recording carries sound (play-and-record, to the speaker), mixing
   * with other audio so the recording is never interrupted or ducked. Android
   * takes no audio focus in this mode.
   */
  private applyAudioSession(): void {
    const recordsAudio = this.recordsAudio;
    if (!this.audio || recordsAudio === null || !this.player) return;
    if (this.sessionFor === recordsAudio) return;
    this.sessionFor = recordsAudio;
    try {
      this.audio
        .setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: recordsAudio,
          interruptionMode: 'mixWithOthers',
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
        })
        .catch(() => undefined);
    } catch {
      /* the clips still play in whatever session the app has */
    }
  }
}
