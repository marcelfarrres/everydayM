import { describe, expect, it } from 'vitest';
import { NOSE_DOCK, noseDock } from '@/components/workout/noseDock';

const base = { pageH: 664, vvPageTop: 0, noseBottom: 470, portholeH: 185 };

describe('the nose docked over the keyboard', () => {
  it('stays put when no keyboard is up (also when the browser bars come and go)', () => {
    expect(noseDock({ ...base, vvHeight: 664 })).toMatchObject({ open: false, lower: 0, rise: 0, portholeScale: 1 });
    expect(noseDock({ ...base, vvHeight: 600 })).toMatchObject({ open: false, lower: 0, rise: 0 });
  });

  it('a short keyboard: the crane lowers the nose to just above it', () => {
    const d = noseDock({ ...base, vvHeight: 520 });
    expect(d.open).toBe(true);
    expect(d.keyboardTop).toBe(520);
    expect(d.lower).toBe(520 - NOSE_DOCK.margin - 470);
    expect(d.rise).toBe(0);
    expect(base.noseBottom + d.lower).toBe(d.keyboardTop - NOSE_DOCK.margin);
  });

  it('a tall keyboard: the nose goes up, and the porthole gives way from its top', () => {
    const d = noseDock({ ...base, vvHeight: 400 });
    expect(d.open).toBe(true);
    expect(d.lower).toBe(0);
    expect(d.rise).toBe(470 - (400 - NOSE_DOCK.margin));
    expect(base.noseBottom - d.rise).toBe(400 - NOSE_DOCK.margin);
    expect(d.portholeScale).toBeCloseTo((185 - d.rise) / 185, 6);
    // (never below nothing)
    expect(noseDock({ ...base, vvHeight: 150 }).portholeScale).toBe(0);
  });

  it('the same numbers whether the page keeps its height (iOS) or is held while the window shrinks (Android)', () => {
    const ios = noseDock({ ...base, vvHeight: 420 });
    // (the window shrank to 420 under the keyboard, the page held at 664: the visual viewport is the window)
    const held = noseDock({ ...base, pageH: 664, vvHeight: 420 });
    expect(held).toEqual(ios);
  });

  it('a panned visual viewport: the keyboard top counts from the page', () => {
    const d = noseDock({ ...base, vvHeight: 400, vvPageTop: 60 });
    expect(d.keyboardTop).toBe(460);
    expect(base.noseBottom - d.rise + d.lower).toBe(460 - NOSE_DOCK.margin);
  });
});
