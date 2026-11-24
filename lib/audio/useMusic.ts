'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { fetchMusic } from '@/lib/data/exercises';
import { MusicEngine, getMusicEngine, type MusicSnapshot } from './music';
import { releaseTalkVideo } from './talkVideo';

const noopSubscribe = () => () => {};

/** Mute, volume and whether there is any music, for the "···" menu. Remembered between visits. */
export function useMusicControls(): {
  music: MusicSnapshot;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
} {
  const engine = getMusicEngine();
  const music = useSyncExternalStore(
    engine?.subscribe ?? noopSubscribe,
    engine?.getSnapshot ?? MusicEngine.serverSnapshot,
    MusicEngine.serverSnapshot,
  );
  const setMuted = useCallback((muted: boolean) => getMusicEngine()?.setMuted(muted), []);
  const setVolume = useCallback((volume: number) => getMusicEngine()?.setVolume(volume), []);
  return { music, setMuted, setVolume };
}

/** The music follows the player: plays while it is open, pauses with it, stops when it closes. */
export function usePlayerMusic(paused: boolean) {
  useEffect(() => {
    const engine = getMusicEngine();
    engine?.setActive(true);
    return () => {
      engine?.stop();
      releaseTalkVideo();
    };
  }, []);

  useEffect(() => {
    getMusicEngine()?.setPaused(paused);
  }, [paused]);
}

/** Loads the playlist from the catalogue (the same download as the exercises). */
export function useCatalogMusic() {
  useEffect(() => {
    let alive = true;
    fetchMusic().then(
      (tracks) => {
        if (alive) getMusicEngine()?.setTracks(tracks);
      },
      () => {
        // no catalogue: no music; the routine screen reports the error
      },
    );
    return () => {
      alive = false;
    };
  }, []);
}
