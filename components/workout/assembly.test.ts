import { describe, expect, it } from 'vitest';
import {
  BIG_RIM,
  DRESS,
  FINALE,
  NOSE_CARRY,
  PIECES,
  PIECE_UNITS,
  QUICK,
  ARRIVE,
  arrivalTimeline,
  TAKEOFF,
  TITLE_MIN,
  TITLE_PX,
  TRUCK,
  answerHulls,
  assemblyLayout,
  bigPorthole,
  finaleSentence,
  fitMs,
  fittedTarget,
  igniteAt,
  joinNames,
  liftFor,
  noseCarryEnd,
  padHull,
  pieceBottom,
  grabPoint,
  grabPoses,
  grabTimeline,
  pieceModes,
  portholeTimeline,
  shownMinutes,
  skyInk,
  skyStep,
  titleSize,
  truckTimeline,
  zoomLines,
} from '@/components/workout/assembly';
import { LAUNCH, standingWindow } from '@/components/workout/launchDrum';

const ALL = ['minutes', 'rounds', 'intensity'];

describe('which pieces go on', () => {
  it('starts with the nose only when all three are asked, and fits them top down as they are answered', () => {
    expect(fittedTarget(ALL, 0)).toBe(1);
    expect(fittedTarget(ALL, 1)).toBe(2);
    expect(fittedTarget(ALL, 2)).toBe(3);
    expect(fittedTarget(ALL, 3)).toBe(4);
  });

  it('fits a piece known from the sentence in its turn, right after the one above it', () => {
    // the sentence said the intensity: the engine goes on as soon as the blocks are on
    const q = ['minutes', 'rounds'];
    expect(fittedTarget(q, 0)).toBe(1);
    expect(fittedTarget(q, 1)).toBe(2);
    expect(fittedTarget(q, 2)).toBe(4);
    // it said the shape: the blocks go on with the minutes
    const s = ['minutes', 'intensity'];
    expect(fittedTarget(s, 0)).toBe(1);
    expect(fittedTarget(s, 1)).toBe(3);
    expect(fittedTarget(s, 2)).toBe(4);
  });

  it('only the minutes asked: the nose alone at first, everything after the answer', () => {
    expect(fittedTarget(['minutes'], 0)).toBe(1);
    expect(fittedTarget(['minutes'], 1)).toBe(4);
  });

  it('brings answered pieces by truck, known ones quickly', () => {
    expect(pieceModes(ALL, 0)).toEqual({ nose: 'quick', minutes: 'quick', blocks: 'quick', engine: 'quick' });
    expect(pieceModes(ALL, 2)).toEqual({ nose: 'quick', minutes: 'truck', blocks: 'truck', engine: 'quick' });
    expect(pieceModes(['minutes', 'rounds'], 2)).toEqual({ nose: 'quick', minutes: 'truck', blocks: 'truck', engine: 'quick' });
  });

  it('keeps the pieces in their order, top down', () => {
    expect(PIECES).toEqual(['nose', 'minutes', 'blocks', 'engine']);
  });
});

describe('the sky', () => {
  it('climbs a step per piece, from dawn to full day', () => {
    expect([1, 2, 3, 4].map(skyStep)).toEqual([0, 1, 2, 3]);
    expect(skyStep(0)).toBe(0);
    expect(skyStep(9)).toBe(3);
  });

  it('writes in light text while the top of the sky is dark, in ink once it is light', () => {
    expect([0, 1, 2, 3].map(skyInk)).toEqual([false, false, true, true]);
  });
});

describe('the layout', () => {
  const at = (w: number, h: number) => assemblyLayout(w, h, padHull(w, h), 0, 0);

  it('stands the rocket on the bar rocket’s hull from today’s launch (never bigger)', () => {
    expect(padHull(390, 844)).toBeGreaterThan(30);
    expect(padHull(390, 844)).toBeLessThan(42);
    expect(padHull(320, 568)).toBeLessThanOrEqual(padHull(390, 844));
  });

  it('stacks the pieces without gaps, the nozzle on the pad', () => {
    for (const [w, h] of [
      [390, 844],
      [320, 568],
      [320, 700],
    ]) {
      const L = at(w, h);
      expect(pieceBottom(L, 'nose')).toBeCloseTo(L.pieces.minutes.top, 0);
      expect(pieceBottom(L, 'minutes')).toBeCloseTo(L.pieces.blocks.top, 0);
      expect(pieceBottom(L, 'blocks')).toBeCloseTo(L.pieces.engine.top, 0);
      expect(pieceBottom(L, 'engine')).toBeCloseTo(L.padTop, 0);
    }
  });

  it('keeps the crane above the rocket, the porthole between the header and the crane', () => {
    for (const [w, h] of [
      [390, 844],
      [320, 568],
    ]) {
      const L = at(w, h);
      expect(L.jib.y + L.jib.h).toBeLessThan(L.rocketTop);
      expect(L.porthole.y + L.porthole.r + L.rim).toBeLessThanOrEqual(L.jib.y);
      expect(L.porthole.y - L.porthole.r - L.rim).toBeGreaterThanOrEqual(64);
      expect(L.porthole.x + L.porthole.r + L.rim).toBeLessThanOrEqual(w);
    }
  });

  it('keeps the questions clear of the rocket and the title clear of the porthole', () => {
    for (const [w, h] of [
      [390, 844],
      [320, 568],
    ]) {
      const L = at(w, h);
      expect(L.column.right).toBeLessThanOrEqual(L.cx - L.box / 2);
      expect(L.column.left + L.column.titleWidth).toBeLessThanOrEqual(L.porthole.x - L.porthole.r - L.rim);
      expect(L.cx + L.box / 2).toBeLessThan(L.tower.x + 1);
    }
  });

  it('makes the porthole big where the height allows, never leaving the title too narrow', () => {
    const L = at(390, 844);
    expect(L.porthole.r).toBeGreaterThanOrEqual(80);
    for (const [w, h] of [
      [390, 844],
      [320, 568],
      [320, 700],
    ]) {
      const M = at(w, h);
      expect(M.column.titleWidth).toBeGreaterThanOrEqual(TITLE_MIN);
    }
  });

  it('sets a title a little smaller only when a word of it would not fit', () => {
    const per = (text: string, px: number) => text.length * px * 0.5;
    expect(titleSize('¿Cuánto tiempo tienes?', 400, per)).toBe(TITLE_PX.max);
    const px = titleSize('¿A qué intensidad?', 180, per);
    expect(px).toBeLessThan(TITLE_PX.max);
    expect(per('intensidad?', px)).toBeLessThanOrEqual(180);
    expect(titleSize('¿A qué intensidad?', 20, per)).toBe(TITLE_PX.min);
  });

  it('makes the answer pieces long enough for their words at 15 px, shortening the nose first', () => {
    const want = answerHulls(36);
    expect(want.blocks).toBeGreaterThan(PIECE_UNITS.blocks * 36 - 0.01);
    const L = at(390, 844);
    expect(L.squeeze).toBe(1);
    expect(L.pieces.blocks.hull).toBeCloseTo(answerHulls(L.T).blocks, 0);
    expect(L.pieces.nose.hull).toBeLessThanOrEqual(PIECE_UNITS.nose * L.T + 0.1);
    // a tall enough 320 px screen needs no squeeze at all
    expect(at(320, 700).squeeze).toBe(1);
  });

  it('puts the window on the nose, under the crane', () => {
    const L = at(390, 844);
    expect(L.window.y).toBeGreaterThan(L.pieces.nose.top);
    expect(L.window.y).toBeLessThan(L.pieces.nose.top + L.pieces.nose.len - L.pieces.nose.hull);
  });

  it('lifts each piece from the truck up to its place, less for the lower ones', () => {
    const L = at(390, 844);
    expect(liftFor(L, 'minutes')).toBeGreaterThan(liftFor(L, 'blocks'));
    expect(liftFor(L, 'blocks')).toBeGreaterThan(liftFor(L, 'engine'));
    expect(liftFor(L, 'engine')).toBeGreaterThanOrEqual(0);
  });

  it('suns climb and the skyline slides with every step', () => {
    const L = at(390, 844);
    for (let i = 1; i < 4; i++) {
      expect(L.suns[i].y).toBeLessThan(L.suns[i - 1].y);
      expect(L.skylineShift[i]).toBeLessThan(L.skylineShift[i - 1]);
    }
  });

  it('draws the zoom lines from the porthole’s rim to the window', () => {
    const big = { x: 300, y: 150, r: 70 };
    const small = { x: 305, y: 330, r: 7 };
    const lines = zoomLines(big, small);
    expect(lines).toHaveLength(2);
    for (const [x1, y1, x2, y2] of lines) {
      expect(Math.hypot(x1 - big.x, y1 - big.y)).toBeCloseTo(big.r, 0);
      expect(Math.hypot(x2 - small.x, y2 - small.y)).toBeCloseTo(small.r, 0);
    }
    expect(zoomLines(big, { x: 300, y: 150, r: 5 })).toEqual([]);
  });
});

describe('the timelines', () => {
  it('runs a truck in order: drive in, lift, dock, two bolts, on, lower, drive off', () => {
    const t = truckTimeline();
    expect(t.driveIn[1]).toBe(TRUCK.driveInMs);
    expect(t.lift[0]).toBe(t.driveIn[1]);
    expect(t.dockAt).toBe(t.lift[1]);
    expect(t.bolts[0]).toBeGreaterThan(t.dockAt);
    expect(t.bolts[1]).toBeGreaterThan(t.bolts[0]);
    expect(t.placedAt).toBeGreaterThan(t.bolts[1]);
    expect(t.lower[0]).toBe(t.placedAt);
    expect(t.driveOut[0]).toBe(t.lower[1]);
    expect(t.endAt).toBe(t.driveOut[1]);
  });

  it('opens one thing after another: the nose in place, then porthole and title, then the tank on its truck', () => {
    const t = arrivalTimeline(true);
    expect(t.revealAt).toBe(0);
    expect(t.deliverAt).toBe(ARRIVE.revealMs);
    expect(t.readyAt).toBe(ARRIVE.revealMs + ARRIVE.deliverMs);
    const none = arrivalTimeline(false);
    expect(none.deliverAt).toBeNull();
    expect(none.readyAt).toBe(ARRIVE.revealMs);
  });

  it('fits a known piece much quicker than a truck brings one', () => {
    expect(fitMs('quick')).toBe(QUICK.riseMs + QUICK.boltMs + QUICK.gapMs);
    expect(fitMs('quick') * 4).toBeLessThan(fitMs('truck'));
  });

  it('takes off in order: cable up, jib in, porthole home, ignition, lift-off as it arrives', () => {
    const t = portholeTimeline(TAKEOFF.igniteLeadMs);
    expect(t.jibAt).toBeGreaterThanOrEqual(t.cableAt + DRESS.cableMs - 1);
    expect(t.jibAt + DRESS.jibMs).toBeLessThanOrEqual(t.shrinkAt);
    expect(t.igniteAt).toBeGreaterThan(t.shrinkAt);
    expect(t.liftAt).toBe(t.shrinkAt + DRESS.shrinkMs);
  });

  it('lifts the held launch off once the sentence has been read', () => {
    const shown = 10_000;
    expect(igniteAt(shown, LAUNCH.igniteMs) + LAUNCH.igniteMs).toBe(shown + FINALE.readMs);
    expect(igniteAt(shown, 5000, 3500)).toBe(shown);
  });
});

describe('the minutes shown', () => {
  it('shows the length chosen, not the real length of the routine', () => {
    expect(shownMinutes(30, 28)).toBe(30);
    for (let m = 20; m <= 40; m++) expect(shownMinutes(m, 28)).toBe(m);
  });

  it('shows the real length when none was chosen', () => {
    expect(shownMinutes(null, 28)).toBe(28);
    expect(shownMinutes(undefined, 28)).toBe(28);
  });

  it('keeps a chosen length within what a routine may last', () => {
    expect(shownMinutes(55, 40)).toBe(40);
    expect(shownMinutes(10, 20)).toBe(20);
  });
});

describe('the sentence', () => {
  it('joins names the Spanish way', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['hombros'])).toBe('hombros');
    expect(joinNames(['pierna', 'glúteo'])).toBe('pierna y glúteo');
    expect(joinNames(['pecho', 'espalda', 'brazos'])).toBe('pecho, espalda y brazos');
  });

  it('says focus, minutes and intensity', () => {
    expect(finaleSentence('pierna y glúteo', 30, 'media')).toBe('Hoy, pierna y glúteo. 30 min, intensidad media.');
  });
});

describe('the big porthole of the ending', () => {
  it('comes, plays its one sequence, then shrinks into the window and the rocket lifts off as it arrives', () => {
    for (const lead of [360, 500]) {
      const t = portholeTimeline(lead);
      expect(t.moveEnd).toBe(DRESS.moveMs);
      expect(t.changeAt).toBeGreaterThan(t.moveEnd);
      expect(t.shrinkAt - t.moveEnd).toBe(DRESS.sequenceMs);
      expect(t.liftAt - t.shrinkAt).toBe(DRESS.shrinkMs);
      expect(t.liftAt - t.igniteAt).toBe(lead);
      // the crane has let go before the porthole starts back
      expect(t.cableAt).toBeGreaterThanOrEqual(t.moveEnd);
      expect(t.jibAt + DRESS.jibMs).toBeLessThanOrEqual(t.shrinkAt);
      expect(t.cableAt + DRESS.cableMs).toBeLessThanOrEqual(t.jibAt + 1);
      // the sentence has been up long enough to read by lift-off
      expect(t.liftAt).toBeGreaterThanOrEqual(FINALE.readMs);
    }
  });

  it('is as large as the free space allows, up to its cap, centred in it', () => {
    const wide = bigPorthole({ left: 0, right: 390, top: 200, bottom: 500 }, 234)!;
    expect(2 * (wide.r + BIG_RIM)).toBe(234);
    expect(wide.x).toBe(195);
    expect(wide.y).toBe(350);
    const short = bigPorthole({ left: 20, right: 270, top: 300, bottom: 460 }, 999)!;
    expect(2 * (short.r + BIG_RIM)).toBe(160);
    expect(short.y - short.r - BIG_RIM).toBeGreaterThanOrEqual(300);
    expect(short.x + short.r + BIG_RIM).toBeLessThanOrEqual(270);
    expect(bigPorthole({ left: 0, right: 50, top: 0, bottom: 500 }, 300)).toBeNull();
  });
});

describe("the standing rocket's window", () => {
  it('follows the launch turning the rocket nose up over its pad', () => {
    const box = { W: 300, H: 80 };
    // a window 40 px before the nose's end, on the centre line
    const w = standingWindow(box, { cx: 260, cy: 40, r: 5 }, { cx: 200, cy: 100, standY: 50, scale: 0.9 });
    expect(w.x).toBeCloseTo(200, 6);
    expect(w.y).toBeCloseTo(100 + 50 - 0.9 * 110, 6);
    expect(w.r).toBeCloseTo(4.5, 6);
    expect(w.top).toBeCloseTo(100 + 50 - 0.9 * 150, 6);
    expect(w.top).toBeLessThan(w.y);
    // a little above the centre line lying is a little to the left standing
    expect(standingWindow(box, { cx: 260, cy: 30, r: 5 }, { cx: 200, cy: 100, standY: 50, scale: 1 }).x).toBeCloseTo(190, 6);
  });
});

describe('the crane picking an answer', () => {
  const at = (w: number, h: number) => assemblyLayout(w, h, padHull(w, h), 0, 0);
  it('grabs from above, lifts straight up, carries, lowers straight down onto the parked truck, which only then drives: bolted in 3.2 to 3.6 s', () => {
    const t = grabTimeline();
    const order = [t.go[1], t.down[1], t.grip[1], t.up[1], t.carry[1], t.lower[1], t.release[1], t.drive[1], t.dockAt, t.bolts[0], t.bolts[1], t.placedAt, t.nextAt];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
    // the truck is parked (still) while the piece comes down and is let go, and moves only after
    expect(t.truckIn[1]).toBeLessThanOrEqual(t.lower[0]);
    expect(t.reposition[1]).toBeLessThanOrEqual(t.lower[0]);
    expect(t.drive[0]).toBeGreaterThanOrEqual(t.release[1]);
    expect(t.placedAt).toBeGreaterThanOrEqual(3200);
    expect(t.placedAt).toBeLessThanOrEqual(3600);
  });

  it('holds the piece from above all the way, turns it upright, and sets it on the bed', () => {
    const t = grabTimeline();
    const len = 120;
    const T = 32;
    const attach = { from: { x: len / 2 - 0.2 * T, y: -T / 2 }, to: { x: len / 2, y: 0 } };
    const cfg = { c0: { x: 80, y: 350 }, attach, rot: -90, scale: { sx: 1, sy: 1 }, endHalf: len / 2, hook: { x: 170, y: 300 }, parkY: 300, clearY: 310, loadX: 240, dropTop: 600 };
    const poses = grabPoses(cfg, t);
    for (let i = 1; i < poses.length; i++) expect(poses[i].t).toBeGreaterThanOrEqual(poses[i - 1].t);
    // straight down onto it (the grabber over its grip point before coming down)
    const grip = grabPoint(poses[0].piece, attach.from);
    // up first, then along, then straight down
    expect(poses.find((p) => p.t > 0 && p.t < t.go[1])!.hook).toEqual({ x: 170, y: 300 });
    expect(poses.find((p) => p.t === t.go[1])!.hook).toEqual({ x: grip.x, y: 300 });
    expect(poses.find((p) => p.t === t.down[1])!.hook).toEqual(grip);
    // already waiting right over it: it only comes down
    const near = grabPoses({ ...cfg, hook: { x: grip.x, y: grip.y - 10 }, overY: grip.y - 10 }, t);
    expect(near.filter((p) => p.t < t.go[1] && p.t > 0)).toEqual([]);
    // from the grip to the release the grabber is on the piece (the hold sliding to its top as it turns)
    for (const p of poses.filter((q) => q.t >= t.down[1] && q.t <= t.release[1])) {
      const s = Math.min(1, Math.max(0, (p.t - t.up[1]) / (t.carry[1] - t.up[1])));
      const a = { x: attach.from.x + (attach.to.x - attach.from.x) * s, y: attach.from.y + (attach.to.y - attach.from.y) * s };
      const held = grabPoint(p.piece, a);
      expect(held.x).toBeCloseTo(p.hook.x, 6);
      expect(held.y).toBeCloseTo(p.hook.y, 6);
    }
    // lifted straight up, then lowered straight down
    const up = poses.find((p) => p.t === t.up[1])!;
    expect(up.hook.x).toBe(grip.x);
    const down = poses.find((p) => p.t === t.lower[1])!;
    expect(down.piece).toEqual({ x: 240, y: 600 + len / 2, rot: -90, sx: 1, sy: 1 });
    // let go: the piece stays exactly where it was set down
    const released = poses.filter((p) => p.t >= t.lower[1]);
    for (const p of released) expect(p.piece).toEqual(down.piece);
    expect(poses[poses.length - 1].hook).toEqual({ x: 240, y: 300 });
  });

  it('starts the answers under the crane arm, and lets the truck wait clear of the rocket', () => {
    for (const [w, h] of [
      [390, 844],
      [320, 568],
    ]) {
      const L = at(w, h);
      expect(L.column.top + L.column.titleMin).toBeGreaterThanOrEqual(L.jib.y + L.jib.h + 12);
      expect(L.pick.loadX + L.box / 2).toBeLessThan(L.cx - L.box / 2);
      expect(L.pick.x0).toBeLessThan(L.jib.x0);
      expect(L.pick.parkY).toBeGreaterThan(L.jib.y + L.jib.h);
    }
  });
});

describe('the typed nose carried to the questions', () => {
  it('ends upright on the questions nose: its tip on the line at the top, as thick and as long', () => {
    const from = { left: 10, top: 500, W: 380, H: 70, T: 40 };
    const to = { cx: 313, top: 290, len: 160, T: 32 };
    const end = noseCarryEnd(from, to);
    expect(end.scale).toBeCloseTo(0.8, 6);
    // the drawing's right end (its antenna's light) lands on the target's top, on its centre line
    const c = { x: from.left + from.W / 2, y: from.top + from.H / 2 };
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(end.transform)!;
    const tip = { x: c.x + Number(m[1]), y: c.y + Number(m[2]) - (end.scale * from.W) / 2 };
    expect(tip.x).toBeCloseTo(to.cx, 0);
    expect(tip.y).toBeCloseTo(to.top, 0);
    // what is left once its flat end is cut is the nose's length
    expect((from.W - end.clipLeft) * end.scale).toBeCloseTo(to.len, 6);
    expect(noseCarryEnd(from, { ...to, len: 999 }).clipLeft).toBe(0);
    expect(NOSE_CARRY.liftMs + NOSE_CARRY.carryMs).toBeLessThan(1800);
  });
});

describe('the minutes tank taken by the crane', () => {
  it('takes it by its top, shrinks it to the minutes piece on the way, sets it on the bed', () => {
    const t = grabTimeline();
    const w = 80;
    const h = 360;
    const cfg = { c0: { x: 90, y: 480 }, attach: { from: { x: 0, y: -h / 2 }, to: { x: 0, y: -h / 2 } }, rot: 0, scale: { sx: 60 / w, sy: 70 / h }, endHalf: 35, hook: { x: 230, y: 470 }, parkY: 290, clearY: 300, loadX: 240, dropTop: 600 };
    const poses = grabPoses(cfg, t);
    for (const p of poses.filter((q) => q.t >= t.down[1] && q.t <= t.release[1])) {
      expect(p.hook.x).toBeCloseTo(p.piece.x, 6);
      expect(p.hook.y).toBeCloseTo(p.piece.y - (h * p.piece.sy) / 2, 6);
    }
    const end = poses.find((p) => p.t === t.lower[1])!.piece;
    expect(end.sx * w).toBeCloseTo(60, 6);
    expect(end.sy * h).toBeCloseTo(70, 6);
    expect(end.y - (h * end.sy) / 2).toBeCloseTo(600, 6);
    // it shrinks smoothly (never a jump in size)
    let prev = 1;
    for (const p of poses) {
      expect(Math.abs(p.piece.sy - prev)).toBeLessThan(0.2);
      prev = p.piece.sy;
    }
  });
});
