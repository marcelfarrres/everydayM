import { afterEach, describe, expect, it, vi } from 'vitest';
import { exercisesFromCatalog, fetchExercises } from './exercises';

const catalog = {
  version: 1,
  updatedAt: '2026-11-24T10:00:00Z',
  music: [{ id: 'm1' }],
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

afterEach(() => {
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

  it('fails clearly without the media base URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', '');
    await expect(fetchExercises()).rejects.toThrow(/NEXT_PUBLIC_MEDIA_BASE_URL/);
  });

  it('reads the catalogue from the media host', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.example.test/');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const list = await fetchExercises();
    expect(list).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith('https://media.example.test/catalog/catalog.json', { cache: 'no-cache' });
  });

  it('turns HTTP errors into a clear message', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.example.test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(fetchExercises()).rejects.toThrow(/404/);
  });
});
