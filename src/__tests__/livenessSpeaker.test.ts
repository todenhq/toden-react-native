const speak = jest.fn();
const stop = jest.fn();
const getAvailableVoicesAsync = jest.fn(() => Promise.resolve([] as unknown[]));
jest.mock('expo-speech', () => ({ speak, stop, getAvailableVoicesAsync }));

// expo-audio: the one player the clips share.
type StatusListener = (status: { didJustFinish: boolean }) => void;
interface FakePlayer {
  replace: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  remove: jest.Mock;
  addListener: jest.Mock;
  /** Plays the clip to its end, as expo-audio reports it. */
  finish: () => void;
}
const players: FakePlayer[] = [];
const createAudioPlayer = jest.fn((_source: unknown, _options?: Record<string, unknown>) => {
  const listeners: StatusListener[] = [];
  const player: FakePlayer = {
    replace: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((event: string, listener: StatusListener) => {
      if (event === 'playbackStatusUpdate') listeners.push(listener);
      return { remove: jest.fn() };
    }),
    finish: () => listeners.forEach((listener) => listener({ didJustFinish: true })),
  };
  players.push(player);
  return player;
});
const setAudioModeAsync = jest.fn((_mode: Record<string, unknown>) => Promise.resolve());
jest.mock('expo-audio', () => ({ createAudioPlayer, setAudioModeAsync }));

// expo-file-system: nothing cached, every download lands at a local path.
const downloadToCache = (url: string) => Promise.resolve({ uri: `file:///cache/${url.split('/').pop()}` });
const downloadFileAsync = jest.fn(downloadToCache);
jest.mock('expo-file-system', () => {
  class Directory {
    create = jest.fn();
  }
  class File {
    exists = false;
    uri = 'file:///cache/unused';
    static downloadFileAsync = downloadFileAsync;
  }
  return { Directory, File, Paths: { cache: {} } };
});
jest.mock('../lib/native-module-present', () => ({ nativeModulePresent: () => true }));

import { CLIP_GRACE_MS, LivenessSpeaker, longestPhraseMs, PAUSE_BETWEEN_PHRASES_MS, pickDeviceVoice } from '../liveness/speech';
import { fetchVoiceManifest, forgetVoiceDownloads } from '../liveness/voiceClips';
import { preloadFlowVoice } from '../liveness/voicePreload';
import type { VoiceManifest } from '../liveness/voicePhrases';

const SERVER = 'https://api.toden.co';
const MANIFEST: VoiceManifest = {
  version: 'v1',
  voices: { lyra: { languages: ['en'] } },
  phrases: {
    en: {
      'presence.position.holdStill': 'Hold still',
      'presence.challenge.nod': 'Nod your head',
      'presence.challenge.passed': 'Good.',
    },
  },
};

const fetchMock = jest.fn();
(globalThis as { fetch: unknown }).fetch = fetchMock;

function answerManifest(body: unknown, status = 200): void {
  fetchMock.mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

/** Lets the manifest fetch, the downloads and the player creation settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function player(): FakePlayer {
  const only = players[0];
  if (!only || players.length !== 1) throw new Error(`expected one player, have ${players.length}`);
  return only;
}

interface DeviceSpeechOptions {
  language: string;
  voice?: string;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (error: Error) => void;
}

/** What the device voice was asked to say, without the end callbacks. */
function deviceSaid(): [string, { language: string; voice?: string }][] {
  return (speak.mock.calls as [string, DeviceSpeechOptions][]).map(
    ([text, { onDone: _d, onStopped: _s, onError: _e, ...options }]) => [text, options],
  );
}

/** The device voice's callbacks for its latest phrase. */
function lastDevicePhrase(): DeviceSpeechOptions {
  const call = speak.mock.calls[speak.mock.calls.length - 1] as [string, DeviceSpeechOptions] | undefined;
  if (!call) throw new Error('the device voice said nothing');
  return call[1];
}

/** Lets the pause between phrases pass. */
function pause(): void {
  jest.advanceTimersByTime(PAUSE_BETWEEN_PHRASES_MS);
}

/** The clips the player was given to play, by phrase key. */
function played(): string[] {
  return player().replace.mock.calls.map(([source]) => String(source.uri).replace(/^.*\/(.+)\.mp3$/, '$1'));
}

async function speakerWithClips(): Promise<LivenessSpeaker> {
  answerManifest(MANIFEST);
  const s = new LivenessSpeaker({ voice: 'lyra' });
  s.prepareVoice(SERVER);
  s.setRecordsAudio(false);
  await settle();
  return s;
}

beforeEach(() => {
  // setImmediate stays real: settle() uses it to let promises land.
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  jest.clearAllMocks();
  players.length = 0;
  getAvailableVoicesAsync.mockImplementation(() => Promise.resolve([]));
  downloadFileAsync.mockImplementation(downloadToCache);
  fetchMock.mockReset();
  // The download is shared across speakers in the app; each test starts with none.
  forgetVoiceDownloads();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('LivenessSpeaker (Android first-phrase race)', () => {
  it('warms the TTS engine at construction, before any phrase', () => {
    // Android's engine initialises asynchronously; without this the first
    // gesture command — often the first utterance of the whole session —
    // raced init and was never heard.
    new LivenessSpeaker(true);
    expect(getAvailableVoicesAsync).toHaveBeenCalledTimes(1);
  });

  it('does not warm anything when guidance is disabled', () => {
    new LivenessSpeaker(false);
    expect(getAvailableVoicesAsync).not.toHaveBeenCalled();
  });

  it('never calls stop() before the first phrase', () => {
    // There is nothing to interrupt yet, and poking a still-initialising
    // Android engine with stop() is what could eat the queued first phrase.
    const s = new LivenessSpeaker(true);
    s.speak('Turn your head to the left');
    expect(stop).not.toHaveBeenCalled();
    expect(deviceSaid()).toEqual([['Turn your head to the left', { language: 'en-US' }]]);
  });

  it('still de-dupes consecutive identical phrases', () => {
    const s = new LivenessSpeaker(true);
    s.speak('Hold still');
    s.speak('Hold still');
    expect(speak).toHaveBeenCalledTimes(1);
  });
});

describe('the device voice', () => {
  const voices = [
    { identifier: 'gb-enhanced', name: 'Serena', quality: 'Enhanced', language: 'en-GB' },
    { identifier: 'us-default', name: 'Samantha', quality: 'Default', language: 'en-US' },
    { identifier: 'us-enhanced', name: 'Ava', quality: 'Enhanced', language: 'en_US' },
  ];

  it('prefers an Enhanced voice for the exact language', () => {
    expect(pickDeviceVoice(voices as never, 'en-US')).toBe('us-enhanced');
  });

  it('falls back to the default when the language has no Enhanced voice', () => {
    expect(pickDeviceVoice(voices.slice(0, 2) as never, 'en-US')).toBeUndefined();
  });

  it('speaks with the Enhanced voice once the device has listed it', async () => {
    getAvailableVoicesAsync.mockImplementation(() => Promise.resolve(voices));
    const s = new LivenessSpeaker(true);
    await settle();
    s.speak('Nod your head');
    expect(deviceSaid()).toEqual([['Nod your head', { language: 'en-US', voice: 'us-enhanced' }]]);
  });
});

describe('Toden voice clips', () => {
  it("fetches nothing with the device's voice chosen", async () => {
    const s = new LivenessSpeaker({ voice: 'device' });
    s.prepareVoice(SERVER);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    s.speak('Nod your head');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('asks for the voices by default, and speaks with the device voice when the server has none to give', async () => {
    // The test manifest says nothing of countries and has no fallback, as an older server.
    const s = new LivenessSpeaker(true);
    s.prepareVoice(SERVER);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    s.speak('Nod your head');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('fetches nothing with guidance off', async () => {
    const s = new LivenessSpeaker({ enabled: false, voice: 'lyra' });
    s.prepareVoice(SERVER);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the manifest once and preloads every clip of the voice', async () => {
    const s = await speakerWithClips();
    s.prepareVoice(SERVER);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/api/kyc/assets/voices/manifest.json`);
    expect(downloadFileAsync).toHaveBeenCalledTimes(3);
    expect(downloadFileAsync.mock.calls.map((c) => c[0])).toContain(
      `${SERVER}/api/kyc/assets/voices/v1/lyra/en/presence.challenge.nod.mp3`,
    );
    // One player for every clip: 24 prepared players would hold 24 decoders.
    expect(players).toHaveLength(1);
  });

  it('plays a ready clip instead of the device voice', async () => {
    const s = await speakerWithClips();
    s.speak('Nod your head');
    expect(played()).toEqual(['presence.challenge.nod']);
    expect(player().play).toHaveBeenCalledTimes(1);
    expect(speak).not.toHaveBeenCalled();
  });

  it('matches the line after normalising', async () => {
    const s = await speakerWithClips();
    s.speak('Hold still…');
    expect(played()).toEqual(['presence.position.holdStill']);
    expect(speak).not.toHaveBeenCalled();
  });

  it('a reworded line uses the device voice', async () => {
    const s = await speakerWithClips();
    s.speak('Kindly nod your head');
    expect(deviceSaid()).toEqual([['Kindly nod your head', { language: 'en-US' }]]);
    expect(player().play).not.toHaveBeenCalled();
  });

  it('a line with no clip uses the device voice', async () => {
    const s = await speakerWithClips();
    s.speak('Move closer');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('a clip still downloading is given a moment, then the device voice says it', async () => {
    downloadFileAsync.mockImplementation(() => new Promise<{ uri: string }>(() => undefined));
    answerManifest(MANIFEST);
    const s = new LivenessSpeaker({ voice: 'lyra' });
    s.prepareVoice(SERVER);
    await settle();
    s.speak('Nod your head');
    jest.advanceTimersByTime(CLIP_GRACE_MS - 1);
    await settle();
    expect(speak).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await settle();
    expect(deviceSaid()).toEqual([['Nod your head', { language: 'en-US' }]]);
  });

  it('a clip that failed to download uses the device voice', async () => {
    downloadFileAsync.mockImplementationOnce(() => Promise.reject(new Error('404')));
    const s = await speakerWithClips();
    s.speak('Hold still');
    lastDevicePhrase().onDone?.();
    pause();
    s.speak('Nod your head');
    player().finish();
    pause();
    s.speak('Good.');
    expect(speak).toHaveBeenCalledTimes(1);
    expect(player().play).toHaveBeenCalledTimes(2);
  });

  it('a clip that throws on play uses the device voice', async () => {
    const s = await speakerWithClips();
    player().play.mockImplementation(() => {
      throw new Error('decode');
    });
    s.speak('Nod your head');
    expect(deviceSaid()).toEqual([['Nod your head', { language: 'en-US' }]]);
  });

  it('a manifest 404 (switch off) leaves every line to the device voice', async () => {
    answerManifest({ error: 'not_found' }, 404);
    const s = new LivenessSpeaker({ voice: 'lyra' });
    s.prepareVoice(SERVER);
    await settle();
    expect(downloadFileAsync).not.toHaveBeenCalled();
    expect(createAudioPlayer).not.toHaveBeenCalled();
    s.speak('Nod your head');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('a manifest without the language leaves the device voice', async () => {
    answerManifest(MANIFEST);
    const s = new LivenessSpeaker({ voice: 'lyra', language: 'fr-FR' });
    s.prepareVoice(SERVER);
    await settle();
    expect(downloadFileAsync).not.toHaveBeenCalled();
    s.speak('Hochez la tête');
    expect(deviceSaid()).toEqual([['Hochez la tête', { language: 'fr-FR' }]]);
  });

  it('a manifest without the voice leaves the device voice', async () => {
    answerManifest(MANIFEST);
    const s = new LivenessSpeaker({ voice: 'retired' });
    s.prepareVoice(SERVER);
    await settle();
    expect(downloadFileAsync).not.toHaveBeenCalled();
  });

  it('gives up on a manifest that does not answer in time', async () => {
    jest.useRealTimers();
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    await expect(fetchVoiceManifest(SERVER, 5)).resolves.toBeNull();
  });

  it('a network failure leaves the device voice', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const s = new LivenessSpeaker({ voice: 'lyra' });
    s.prepareVoice(SERVER);
    await settle();
    s.speak('Nod your head');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('stop() stops the clip, dispose() frees the player', async () => {
    const s = await speakerWithClips();
    s.speak('Nod your head');
    s.stop();
    expect(player().pause).toHaveBeenCalledTimes(1);
    s.dispose();
    expect(player().remove).toHaveBeenCalledTimes(1);
    s.speak('Good.');
    expect(deviceSaid()).toEqual([['Good.', { language: 'en-US' }]]);
  });

  it('keeps the iOS audio session active between clips', async () => {
    await speakerWithClips();
    expect(createAudioPlayer.mock.calls[0]![1]).toEqual({ keepAudioSessionActive: true });
  });

  it('sets the audio session to play beside the camera, and the microphone when it records', async () => {
    const s = await speakerWithClips();
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenLastCalledWith({
      playsInSilentMode: true,
      allowsRecording: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
    s.setRecordsAudio(true);
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: true }));
  });

  it('leaves the audio session alone when no clip loaded', async () => {
    answerManifest({ error: 'not_found' }, 404);
    const s = new LivenessSpeaker({ voice: 'lyra' });
    s.prepareVoice(SERVER);
    s.setRecordsAudio(true);
    await settle();
    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });
});

describe('turn-taking: a phrase is never cut off', () => {
  it('lets the phrase being said finish, then says the next after a short pause', async () => {
    const s = await speakerWithClips();
    s.speak('Nod your head');
    s.speak('Hold still');
    expect(played()).toEqual(['presence.challenge.nod']);
    expect(player().pause).not.toHaveBeenCalled();

    player().finish();
    jest.advanceTimersByTime(PAUSE_BETWEEN_PHRASES_MS - 1);
    expect(played()).toEqual(['presence.challenge.nod']);
    jest.advanceTimersByTime(1);
    expect(played()).toEqual(['presence.challenge.nod', 'presence.position.holdStill']);
  });

  it('lets a device phrase finish too, before the next', () => {
    const s = new LivenessSpeaker(true);
    s.speak('Turn your head to the left');
    s.speak('Great');
    expect(stop).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);

    lastDevicePhrase().onDone?.();
    pause();
    expect(deviceSaid().map(([text]) => text)).toEqual(['Turn your head to the left', 'Great']);
  });

  it('says only the newest of the phrases that queued up meanwhile', async () => {
    const s = await speakerWithClips();
    s.speak('Nod your head');
    s.speak('Hold still');
    s.speak('Move closer');
    player().finish();
    jest.advanceTimersByTime(5_000);

    expect(played()).toEqual(['presence.challenge.nod']);
    expect(deviceSaid().map(([text]) => text)).toEqual(['Move closer']);
  });

  it('drops a waiting phrase equal to the one being said', async () => {
    const s = await speakerWithClips();
    s.speak('Nod your head');
    s.speak('Hold still');
    s.speak('Nod your head');
    player().finish();
    jest.advanceTimersByTime(5_000);

    expect(played()).toEqual(['presence.challenge.nod']);
    expect(speak).not.toHaveBeenCalled();
  });

  it('a device phrase waits for the clip being said, and a clip for the device voice', async () => {
    const s = await speakerWithClips();
    s.speak('Nod your head');
    s.speak('Move closer');
    jest.advanceTimersByTime(1_000);
    expect(player().pause).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();

    player().finish();
    pause();
    s.speak('Good.');
    jest.advanceTimersByTime(1_000);
    expect(stop).not.toHaveBeenCalled();
    expect(played()).toEqual(['presence.challenge.nod']);

    lastDevicePhrase().onStopped?.();
    pause();
    expect(played()).toEqual(['presence.challenge.nod', 'presence.challenge.passed']);
  });

  it('a device voice error counts as finished', () => {
    const s = new LivenessSpeaker(true);
    s.speak('Move closer');
    s.speak('Move further away');
    lastDevicePhrase().onError?.(new Error('engine'));
    pause();
    expect(deviceSaid().map(([text]) => text)).toEqual(['Move closer', 'Move further away']);
  });

  it('a watchdog ends a phrase whose end never comes', () => {
    const s = new LivenessSpeaker(true);
    s.speak('Move closer');
    s.speak('Hold still');
    jest.advanceTimersByTime(longestPhraseMs('Move closer') - 1);
    expect(speak).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    pause();
    expect(deviceSaid().map(([text]) => text)).toEqual(['Move closer', 'Hold still']);
  });

  it('on retry, forgets the waiting phrase but lets the one being said finish', async () => {
    const s = await speakerWithClips();
    s.speak('Nod your head');
    s.speak('Hold still');
    s.reset();
    player().finish();
    jest.advanceTimersByTime(longestPhraseMs('Nod your head') + 1_000);
    expect(played()).toEqual(['presence.challenge.nod']);
  });

  it('forgets the waiting phrase when stopped', async () => {
    const s = await speakerWithClips();
    s.speak('Nod your head');
    s.speak('Hold still');
    s.stop();
    player().finish();
    jest.advanceTimersByTime(longestPhraseMs('Nod your head') + 1_000);
    expect(played()).toEqual(['presence.challenge.nod']);

    s.speak('Good.');
    expect(played()).toEqual(['presence.challenge.nod', 'presence.challenge.passed']);
  });
});

describe('the voice loads when the flow starts', () => {
  const FLOW = { apiKey: 'pk_dev_test', devUrl: SERVER, voiceGuidance: { voice: 'lyra' } };
  beforeEach(() => answerManifest(MANIFEST));

  it('fetches the manifest and every clip as soon as the flow knows its voice', async () => {
    preloadFlowVoice(FLOW);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${SERVER}/api/kyc/assets/voices/manifest.json`);
    expect(downloadFileAsync).toHaveBeenCalledTimes(3);
  });

  it("fetches nothing with guidance off, the device's voice chosen, or no server", async () => {
    preloadFlowVoice({ ...FLOW, voiceGuidance: { enabled: false, voice: 'lyra' } });
    preloadFlowVoice({ ...FLOW, voiceGuidance: { voice: 'device' } });
    preloadFlowVoice({ ...FLOW, apiKey: 'not-a-key', devUrl: undefined });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the liveness step plays the clips the flow fetched, fetching nothing again', async () => {
    preloadFlowVoice(FLOW);
    await settle();
    const s = new LivenessSpeaker({ voice: 'lyra' });
    s.prepareVoice(SERVER);
    s.setRecordsAudio(false);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(downloadFileAsync).toHaveBeenCalledTimes(3);
    s.speak('Nod your head');
    expect(played()).toEqual(['presence.challenge.nod']);
    expect(speak).not.toHaveBeenCalled();
  });

  it('the step joins a download still under way, and its first phrase waits for its clip', async () => {
    const landing: Array<(value: { uri: string }) => void> = [];
    downloadFileAsync.mockImplementation(
      (url: string) => new Promise<{ uri: string }>((resolve) => landing.push(() => resolve({ uri: `file:///cache/${url.split('/').pop()}` }))),
    );
    answerManifest(MANIFEST);
    preloadFlowVoice(FLOW);
    const s = new LivenessSpeaker({ voice: 'lyra' });
    s.prepareVoice(SERVER);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    s.speak('Nod your head');
    jest.advanceTimersByTime(CLIP_GRACE_MS / 2);
    await settle();
    expect(speak).not.toHaveBeenCalled();
    landing.forEach((land) => land({ uri: '' }));
    await settle();
    expect(played()).toEqual(['presence.challenge.nod']);
    expect(speak).not.toHaveBeenCalled();
  });

  it('a phrase waits while the manifest itself is still coming', async () => {
    let answer: (value: unknown) => void = () => undefined;
    fetchMock.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const s = new LivenessSpeaker({ voice: 'lyra' });
    s.prepareVoice(SERVER);
    s.speak('Good.');
    await settle();
    expect(speak).not.toHaveBeenCalled();
    answer({ ok: true, status: 200, json: () => Promise.resolve(MANIFEST) });
    await settle();
    expect(played()).toEqual(['presence.challenge.passed']);
  });

  it('never waits once the manifest has failed, or for a line with no clip', async () => {
    answerManifest({ error: 'not_found' }, 404);
    const failed = new LivenessSpeaker({ voice: 'lyra' });
    failed.prepareVoice(SERVER);
    await settle();
    failed.speak('Nod your head');
    expect(speak).toHaveBeenCalledTimes(1);

    forgetVoiceDownloads();
    downloadFileAsync.mockImplementation(() => new Promise<{ uri: string }>(() => undefined));
    answerManifest(MANIFEST);
    const loading = new LivenessSpeaker({ voice: 'lyra' });
    loading.prepareVoice(SERVER);
    await settle();
    loading.speak('Move closer');
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('a manifest that failed is tried again by the step', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    preloadFlowVoice(FLOW);
    await settle();
    answerManifest(MANIFEST);
    const s = new LivenessSpeaker({ voice: 'lyra' });
    s.prepareVoice(SERVER);
    s.setRecordsAudio(false);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    s.speak('Hold still');
    expect(played()).toEqual(['presence.position.holdStill']);
  });

  it('a flow opened again fetches the manifest again, so changed clips are picked up', async () => {
    preloadFlowVoice(FLOW);
    await settle();
    preloadFlowVoice(FLOW);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
