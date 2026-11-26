/*
 * The rocket of the rest transition on a computer: the app's one rocket (the first screen's
 * PadRocket, in the parts every rocket is drawn with), standing on its tail with its nose at the
 * very top of the drawing (it marks where the routine is on the rail). White with the ink line,
 * the belly shaded, the red band and the flame.
 * The flame (`.rocket-flame`) scales from the nozzle; CloudTransition makes it flicker in flight.
 */

import type { CSSProperties } from 'react';
import { PadRocket } from '@/components/workout/PadRocket';
import { padRocketGeometry } from '@/components/workout/padRocketShape';
import { FlameLayers } from '@/components/workout/RocketParts';

// (Computer only: on a phone the clouds carry RocketShip, the same drawing as the widget.)

/** The drawing's box (as it always was: 120 × 560, nose at the top), and the rocket lying in it before it is stood up. */
const BOX = { w: 120, h: 560 } as const;
const G = padRocketGeometry({ length: 450, body: 60, hatch: false });
/** room for the flame under the nozzle, and the rocket centred across the box */
const FLAME_ROOM = BOX.h - G.W;
const ACROSS = (BOX.w - G.H) / 2;
// lying (x along the rocket, y across it) → standing in the box, nose up
const STAND_UP = `translate(${ACROSS} ${BOX.h}) rotate(-90) translate(${FLAME_ROOM} 0)`;

export function Rocket({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} aria-hidden="true" className={className} style={style}>
      {/* the flame, from the nozzle's mouth down (its box's top is its root) */}
      <g className="rocket-flame">
        <g transform={STAND_UP}>
          <FlameLayers x={0} cy={G.cy} along={FLAME_ROOM * 0.95} across={41} />
        </g>
      </g>
      <g transform={STAND_UP}>
        <PadRocket g={G} parts={{ flame: false }} />
      </g>
    </svg>
  );
}
