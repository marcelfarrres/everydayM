import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RocketShip } from './RocketShip';
import { stackGeometry } from './rocketShape';
import type { StepState } from './player/model';

/*
 * The routine's rocket as drawn (RocketShip, 26-11-2026): its layers keep the contract the bar's
 * stretch and the separation rely on, and the fins show only once the boosters are off.
 */

const hilo: StepState[][] = [
  ['done', 'now', 'todo', 'todo'],
  ['todo', 'todo', 'todo', 'todo'],
  ['todo', 'todo', 'todo', 'todo'],
];
const draw = (props: Parameters<typeof RocketShip>[0]) => renderToStaticMarkup(createElement(RocketShip, props));
const parts = (html: string) => [...html.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);

describe('RocketShip', () => {
  it('in the warm-up: the boosters, no fins; every stage named, with its bars', () => {
    const html = draw({ g: stackGeometry({ width: 325, blocks: 3, boosters: true }), hilo });
    expect(html).toContain('data-piece="boosters"');
    expect(html).not.toContain('data-fin=');
    for (const b of [1, 2, 3]) expect(html).toContain(`>Bloque ${b}</text>`);
    expect(html.match(/data-rocket="hilo"/g)).toHaveLength(3);
  });

  it('once the boosters are off: the fins at the tail (inside the hull until they spring out)', () => {
    const g = stackGeometry({ width: 325, blocks: 3, first: 2 });
    const out = draw({ g, hilo });
    expect(out.match(/data-fin="(top|bottom)"/g)).toHaveLength(2);
    expect(out).not.toContain('scale(1, 0)');
    const hidden = draw({ g, hilo, finsOut: false });
    expect(hidden.match(/scale\(1, 0\)/g)).toHaveLength(2);
    // (the fins are the tail's: drawn once, with the stage that is the tail now)
    expect(out.match(/data-piece="seg-2"[^>]*data-part="start"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(out).not.toContain('data-piece="seg-1"');
  });

  it('only uses the stretch’s own layer names, so no part of a drawing is moved twice', () => {
    const html = draw({ g: stackGeometry({ width: 325, blocks: 3 }), hilo });
    expect(new Set(parts(html))).toEqual(new Set(['start', 'body', 'end', 'mid']));
    // the names are never scaled along: their layer is `mid`
    expect(html.match(/data-part="mid"/g)).toHaveLength(3);
  });

  it('draws one stage on its own (a piece coming off), with its name, bars and fins', () => {
    const html = draw({ g: stackGeometry({ width: 325, blocks: 3 }), hilo, only: ['seg-1'] });
    expect(html).toContain('>Bloque 1</text>');
    expect(html).not.toContain('Bloque 2');
    expect(html.match(/data-fin=/g)).toHaveLength(2);
  });

  it('as every other rocket (one stage, no hilo): no names, no bars', () => {
    const html = draw({ g: stackGeometry({ width: 300 }) });
    expect(html).not.toContain('<text');
    expect(html).not.toContain('data-rocket="hilo"');
  });
});
