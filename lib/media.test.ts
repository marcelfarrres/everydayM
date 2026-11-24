import { describe, expect, it } from 'vitest';
import { playbackUrl, retryWithOriginal } from './media';

function fakeVideo(src: string) {
  const el = {
    src,
    getAttribute: (name: string) => (name === 'src' ? el.src : null),
  };
  return el;
}

describe('playbackUrl', () => {
  it('plays the light copy when there is one, the original otherwise', () => {
    expect(playbackUrl({ video_url: '/o.mp4', video_lite_url: '/l.mp4' })).toBe('/l.mp4');
    expect(playbackUrl({ video_url: '/o.mp4', video_lite_url: null })).toBe('/o.mp4');
  });
});

describe('retryWithOriginal', () => {
  it('falls back from a broken light copy to the original once', () => {
    const media = { video_url: '/o.mp4', video_lite_url: '/l.mp4' };
    const el = fakeVideo('/l.mp4');
    expect(retryWithOriginal(el, media)).toBe(true);
    expect(el.src).toBe('/o.mp4');
    // the original failed too: nothing left to try
    expect(retryWithOriginal(el, media)).toBe(false);
  });

  it('has nothing to try when the original was already playing', () => {
    expect(retryWithOriginal(fakeVideo('/o.mp4'), { video_url: '/o.mp4', video_lite_url: null })).toBe(false);
  });
});
