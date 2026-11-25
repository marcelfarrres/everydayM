'use client';

import { useCallback, useRef } from 'react';
import { useCloudPainter } from '@/components/workout/cloudClock';
import { RocketShip, type Piece } from '@/components/workout/RocketShip';
import type { ShipGeometry } from '@/components/workout/rocketShape';
import { SEPARATION_PUFFS, crewAt, pieceAt, puffAt, type MechanicPose } from '@/components/workout/separation';
import { CrewPuff, MECHANIC, Mechanic } from './Mechanic';
import type { StepState } from './model';

/*
 * The separation in the clouds after a block (or after the warm-up), phone: the mechanics of the
 * rests come in from the left, undo the latch and knock the part loose; it falls away slowly; the
 * engine coughs twice and catches (its flame is the rocket's own: cloudFlameKeyframes). Painted on
 * every frame from the clouds' one clock (separation.ts: pure poses of `t`), only transforms and
 * opacity. It hangs from the rocket, in its drawing's px: the rocket stands on its tail there, so
 * the mechanics are turned back upright (and keep the rocket's size, as in the bar).
 */

export interface SeparationScene {
  /** the part, drawn from the rocket as it was */
  g: ShipGeometry;
  piece: Piece;
  /** along the rocket: the latch (where the wrench works) and where the hammer knocks it loose */
  joint: number;
  part: number;
  /** across: the hull's edge on the screen's left (where they stand) */
  edge: number;
  /** the nozzle's exit once the part is off (where the engine coughs) */
  tail: number;
  /** how far it falls to be out of the bottom of the screen, and how far the screen's left edge is from them (px) */
  fall: number;
  off: number;
}

const PARTS = ['face', 'arm', 'back', 'head', 'legL', 'legR'] as const;
// where each one's hand meets the hull (its box: the wrench held straight out, the hammer's head at the blow)
const STAND = { b: { left: -34, top: -14 }, a: { left: -32, top: -23 } } as const;

export function Separation({ restKey, scene, hilo, reduced }: { restKey: number; scene: SeparationScene; hilo: StepState[][]; reduced: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const els = useRef<Map<string, HTMLElement> | null>(null);

  const paint = useCallback(
    (t: number | null, key: number | null) => {
      const node = root.current;
      if (!node) return;
      if (!els.current) {
        els.current = new Map();
        node.querySelectorAll<HTMLElement>('[data-part], [data-sep]').forEach((el) => els.current?.set(el.dataset.sep ?? el.dataset.part ?? '', el));
      }
      const el = (name: string) => els.current?.get(name);
      const now = key === restKey ? t : null;
      // nothing of it outside its own clouds
      node.style.visibility = now === null ? 'hidden' : 'visible';
      if (now === null) return;

      const piece = pieceAt(now, scene.fall, reduced);
      const p = el('piece');
      if (p) {
        p.style.opacity = piece.shown ? String(piece.opacity) : '0';
        p.style.transform = `translate(${piece.x}px, ${piece.y}px) rotate(${piece.rot}deg)`;
      }
      SEPARATION_PUFFS.forEach((puff, i) => {
        const at = puffAt(puff, now, reduced);
        const n = el(`puff-${i}`);
        if (!n) return;
        n.style.opacity = String(at.opacity);
        // (turned back upright with the mechanics)
        n.style.transform = `translate(${at.x}px, ${at.y}px) rotate(90deg) scale(${at.scale})`;
      });
      const crew = crewAt(now, scene.off, reduced);
      const pose = (id: 'a' | 'b', m: MechanicPose) => {
        const box = el(`${id}-box`);
        if (!box) return;
        box.style.opacity = m.shown ? '1' : '0';
        box.style.transform = `translate(${m.x}px, 0px)`;
        for (const part of PARTS) {
          const n = el(`${id}-${part}`);
          if (n) n.style.transform = part === 'face' ? `scaleX(${m.face})` : `rotate(${m[part]}deg)`;
        }
      };
      pose('a', crew.a);
      pose('b', crew.b);
    },
    [restKey, scene, reduced],
  );
  useCloudPainter(paint);

  const box = scene.piece === 'boosters' ? { a: scene.g.boosters?.x0 ?? scene.g.x0, b: scene.g.boosters?.x1 ?? scene.g.x0 } : { a: scene.g.segments[0].start, b: scene.g.segments[0].end };
  const puffAtFrom = (from: 'joint' | 'tail') => (from === 'joint' ? { x: scene.joint, y: scene.edge - 4 } : { x: scene.tail - 4, y: scene.g.cy });
  return (
    <div ref={root} aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ visibility: 'hidden' }}>
      {/* the part, once it is off (until then the rocket draws it) */}
      <div data-sep="piece" className="absolute inset-0" style={{ opacity: 0, transformOrigin: `${(box.a + box.b) / 2}px ${scene.g.cy}px` }}>
        <RocketShip g={scene.g} only={[scene.piece]} hilo={hilo} className="absolute left-0 top-0" />
      </div>
      {SEPARATION_PUFFS.map((puff, i) => {
        const at = puffAtFrom(puff.from);
        return (
          <div key={i} data-sep={`puff-${i}`} className="absolute" style={{ left: at.x - 11, top: at.y - 7.5, width: 22, height: 15, opacity: 0 }}>
            <CrewPuff />
          </div>
        );
      })}
      {/* the two, each standing upright by the hull (the wrench at the latch, the hammer by the part) */}
      {(['b', 'a'] as const).map((id) => (
        <div key={id} className="absolute h-0 w-0" style={{ left: id === 'b' ? scene.joint : scene.part, top: scene.edge, transform: 'rotate(90deg)' }}>
          <div data-sep={`${id}-box`} className="absolute" style={{ ...STAND[id], width: MECHANIC.W, height: MECHANIC.H, opacity: 0 }}>
            <div className={`absolute inset-0 ${id === 'a' ? 'rc-nod' : 'rc-nod-b'}`}>
              <Mechanic id={id} tool={id === 'a' ? 'hammer' : 'wrench'} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
