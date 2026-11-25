import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogRests, findRest, parseCatalog, updateCatalog, CATALOG_PATH } from './catalog';
import { validateRestMetadata, validateRestPatch } from './exerciseMetadata';
import type { Catalog, RestVideo } from '@/types/catalog';

// 'server-only' throws outside a React Server Components build; vi.mock is hoisted above the imports.
vi.mock('server-only', () => ({}));

// The media store as an in-memory map: updateCatalog reads, backs up and writes through it.
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/server/mediaStore', () => ({
  getObjectText: async (path: string) => store.get(path) ?? null,
  putContent: async (path: string, content: string) => {
    store.set(path, content);
    return `/dev-media/${path}`;
  },
  listObjects: async () => [],
  deleteObject: async () => true,
}));

function rest(id: string, extra: Partial<RestVideo> = {}): RestVideo {
  return {
    id,
    title: `Descanso ${id}`,
    video_url: `/dev-media/rests/${id}.mp4`,
    video_lite_url: `/dev-media/rests/lite/${id}.mp4`,
    poster_url: `/dev-media/rests/posters/${id}.webp`,
    duration_seconds: 20,
    enabled: true,
    ...extra,
  };
}

describe('parseCatalog · rests', () => {
  it('turns a catalog written before rest videos into an empty list', () => {
    const catalog = parseCatalog(JSON.stringify({ version: 1, exercises: [], music: [] }));
    expect(catalog.rests).toEqual([]);
  });

  it('keeps valid rest videos, skips broken ones and fills defaults', () => {
    const catalog = parseCatalog(
      JSON.stringify({
        version: 1,
        exercises: [],
        music: [],
        rests: [
          rest('a'),
          { id: 'b', video_url: '/dev-media/rests/b.mp4', duration_seconds: '12', extra: 'dropped' },
          { id: 'c' }, // no video: skipped
          'nonsense',
        ],
      }),
    );
    expect(catalog.rests).toEqual([
      rest('a'),
      {
        id: 'b',
        title: 'Descanso',
        video_url: '/dev-media/rests/b.mp4',
        video_lite_url: null,
        poster_url: null,
        duration_seconds: 12,
        enabled: true,
      },
    ]);
  });

  it('keeps a disabled rest video disabled', () => {
    const catalog = parseCatalog(JSON.stringify({ rests: [rest('a', { enabled: false })] }));
    expect(catalog.rests?.[0].enabled).toBe(false);
  });
});

describe('catalogRests / findRest', () => {
  it('creates the list when the field is missing', () => {
    const catalog: Catalog = { version: 1, updatedAt: '', exercises: [], music: [] };
    catalogRests(catalog).push(rest('a'));
    expect(catalog.rests).toHaveLength(1);
    expect(findRest(catalog, 'a').title).toBe('Descanso a');
  });

  it('throws a 404 error for an unknown id', () => {
    const catalog: Catalog = { version: 1, updatedAt: '', exercises: [], music: [], rests: [] };
    expect(() => findRest(catalog, 'nope')).toThrow('Vídeo de descanso no encontrado.');
  });
});

describe('updateCatalog · rests', () => {
  beforeEach(() => store.clear());

  it('adds the newest first and keeps a backup of the previous file', async () => {
    store.set(CATALOG_PATH, JSON.stringify({ version: 1, exercises: [], music: [] }));
    await updateCatalog((catalog) => {
      catalogRests(catalog).unshift(rest('old'));
    });
    await updateCatalog((catalog) => {
      catalogRests(catalog).unshift(rest('new'));
    });

    const saved = parseCatalog(store.get(CATALOG_PATH) ?? '');
    expect(saved.rests?.map((r) => r.id)).toEqual(['new', 'old']);
    const backups = [...store.keys()].filter((k) => k.startsWith('catalog/backups/'));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it('does not lose rest videos when another section writes the catalog', async () => {
    store.set(CATALOG_PATH, JSON.stringify({ version: 1, exercises: [], music: [], rests: [rest('a')] }));
    await updateCatalog((catalog) => {
      catalog.music = [];
    });
    expect(parseCatalog(store.get(CATALOG_PATH) ?? '').rests?.map((r) => r.id)).toEqual(['a']);
  });
});

describe('validateRestMetadata / validateRestPatch', () => {
  it('defaults the title to «Descanso»', () => {
    expect(validateRestMetadata(undefined)).toEqual({ title: 'Descanso' });
    expect(validateRestMetadata({ title: '   ' })).toEqual({ title: 'Descanso' });
    expect(validateRestMetadata({ title: ' Estiramiento ' })).toEqual({ title: 'Estiramiento' });
  });

  it('rejects a title that is not text or too long', () => {
    expect(() => validateRestMetadata({ title: 3 })).toThrow();
    expect(() => validateRestMetadata({ title: 'x'.repeat(121) })).toThrow();
  });

  it('accepts a rename and/or an on/off change', () => {
    expect(validateRestPatch({ title: 'Respirar' })).toEqual({ title: 'Respirar' });
    expect(validateRestPatch({ enabled: false })).toEqual({ enabled: false });
  });

  it('rejects an empty title, a non-boolean enabled and an empty patch', () => {
    expect(() => validateRestPatch({ title: '' })).toThrow('obligatorio');
    expect(() => validateRestPatch({ enabled: 'no' })).toThrow();
    expect(() => validateRestPatch({})).toThrow('No hay ningún cambio');
  });
});
