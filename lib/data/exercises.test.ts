import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCatalogCache, exercisesFromCatalog, fetchCatalog, fetchExercises, fetchMusic, fetchRests, musicFromCatalog, restsFromCatalog } from './exercises';

const catalog = {
  version: 1,
  updatedAt: '2026-11-24T10:00:00Z',
  music: [
    { id: 'm1', title: 'Uno', audio_url: 'https://media.example.test/music/m1.m4a', duration_seconds: 120, enabled: true },
    { id: 'm2', title: 'Dos', audio_url: 'https://media.example.test/music/m2.m4a', enabled: false }, // off: dropped
    { id: 'm3', audio_url: '' }, // no file: dropped
    { id: 'm4', audio_url: '/dev-media/music/m4.m4a' }, // enabled unless it says otherwise
  ],
  rests: [
    { id: 'r1', title: 'Estirando', video_url: 'r1.mp4', video_lite_url: 'r1-lite.mp4', duration_seconds: 30, enabled: true },
    { id: 'r2', video_url: 'r2.mp4', enabled: false }, // off: dropped
    { id: 'r3', video_url: '' }, // no file: dropped
  ],
  exercises: [
    { id: 'a', title: 'Puente', video_url: 'a.mp4', type: 'workout', muscle: '', difficulty: 5, duration_seconds: 40 },
    {
      id: 7,
      title: 'Sentadilla',
      video_url: 'b.mp4',
      extra: 'ignored',
      talks: [
        { id: 't1', exercise_id: 7, video_url: 't1.mp4', duration_seconds: 15 },
        { id: 't2', exercise_id: 7 }, // no video: dropped
      ],
    },
    { id: 'c', title: '', video_url: 'c.mp4' }, // no title: dropped
    'nonsense',
  ],
};

const ok = () => vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 }));

afterEach(() => {
  clearCatalogCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('exercise catalogue', () => {
  it('keeps valid entries, drops broken ones and normalises talks', () => {
    const list = exercisesFromCatalog(catalog);
    expect(list.map((e) => e.id)).toEqual(['a', '7']);
    expect(list[0].talks).toEqual([]);
    expect(list[1].talks).toHaveLength(1);
    expect(list[1].talks?.[0]).toMatchObject({ id: 't1', exercise_id: '7', video_lite_url: null, duration_seconds: 15 });
  });

  it('rejects a body without an exercise list', () => {
    expect(() => exercisesFromCatalog({ version: 1 })).toThrow(/catálogo/);
  });

  it('keeps only enabled tracks with a file', () => {
    const music = musicFromCatalog(catalog);
    expect(music.map((m) => m.id)).toEqual(['m1', 'm4']);
    expect(music[0]).toMatchObject({ title: 'Uno', duration_seconds: 120, enabled: true, artist: null });
    expect(musicFromCatalog({ exercises: [] })).toEqual([]);
  });

  it('fails clearly without the media base URL in production', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(fetchExercises()).rejects.toThrow(/NEXT_PUBLIC_MEDIA_BASE_URL/);
  });

  it('reads the local media folder in development when no base URL is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await fetchExercises();
    expect(fetchMock).toHaveBeenCalledWith('/dev-media/catalog/catalog.json', { cache: 'no-store' });
  });

  it('reads the catalogue from the media host', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.example.test/');
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    const list = await fetchExercises();
    expect(list).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith('https://media.example.test/catalog/catalog.json', { cache: 'no-store' });
  });

  it('serves exercises and music from one download', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.example.test');
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    const [exercises, music, rests, whole] = await Promise.all([fetchExercises(), fetchMusic(), fetchRests(), fetchCatalog()]);
    expect(exercises).toHaveLength(2);
    expect(music).toHaveLength(2);
    expect(rests.map((r) => r.id)).toEqual(['r1']);
    expect(whole.music).toBe(music);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns HTTP errors into a clear message and retries next time', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.example.test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(fetchExercises()).rejects.toThrow(/404/);
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchMusic()).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('rest videos', () => {
  it('keeps enabled ones with a file, and a catalogue without them has none', () => {
    const rests = restsFromCatalog(catalog);
    expect(rests).toEqual([
      { id: 'r1', title: 'Estirando', video_url: 'r1.mp4', video_lite_url: 'r1-lite.mp4', poster_url: null, duration_seconds: 30, enabled: true },
    ]);
    expect(restsFromCatalog({ ...catalog, rests: undefined })).toEqual([]);
    expect(restsFromCatalog(null)).toEqual([]);
  });
});
