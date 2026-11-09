import { useEffect, useState } from 'react';

type Phase = 'reading' | 'found' | 'hidden';

/** How long "Found N people" holds before the list appears. */
const FOUND_HOLD_MS = 1600;
/** A read that runs this long gives way to the list; its people merge when it lands. */
export const READING_GIVE_UP_MS = 60_000;

/**
 * Whether the key-people step shows its full reading screen
 * (KeyPeopleReadingScreen). Mirrors the web SDK's use-reading-screen, and in which state.
 *
 * Shown when the step opens while a company document is still being read.
 * When the read lands with people, it says how many for a moment, then the
 * list appears with them in it; with nobody found it simply gives way. A read
 * that runs past a minute gives way too, so nobody is held here: it carries on
 * and its people are merged when it lands. `settling` is reading
 * OR a finished read not yet merged into the list, so the count is never read
 * a render too early.
 */
export function useReadingScreen(settling: boolean, found: number) {
  const [phase, setPhase] = useState<Phase>(settling ? 'reading' : 'hidden');

  useEffect(() => {
    if (phase === 'reading' && !settling) setPhase(found > 0 ? 'found' : 'hidden');
  }, [phase, settling, found]);

  useEffect(() => {
    if (phase !== 'reading') return;
    const giveUp = setTimeout(() => setPhase('hidden'), READING_GIVE_UP_MS);
    return () => clearTimeout(giveUp);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'found') return;
    const done = setTimeout(() => setPhase('hidden'), FOUND_HOLD_MS);
    return () => clearTimeout(done);
  }, [phase]);

  return {
    show: phase !== 'hidden',
    found: phase === 'found' ? found : null,
  };
}
