'use client';

import { useId, type ReactNode } from 'react';
import type { MuscleId, MuscleSelection } from '@/types/workout';

const RED = '#ff3b30';

type Side = 'front' | 'back';
// A muscle outline drawn over Marcel, in a 334×1000 box around his body (M/L/C commands only,
// so every pair of numbers is a point).
// `mirror` repeats the plate on the other half of the body (the box is symmetric around x = 167).
// `shift` nudges a plate towards the body's centre line (his legs stand a little inside the box edges).
// `soft` marks muscle hidden under the shorts: only faint scan lines, so the leg seems to
// continue under the fabric instead of sitting on top of it like armour.
type Plate = { ids: MuscleId[]; d: string; mirror?: boolean; shift?: number; soft?: boolean };

const UPPER_ARM: MuscleId[] = ['biceps', 'triceps'];
const THIGH_FRONT: MuscleId[] = ['cuadriceps', 'aductores'];
const THIGH_BACK: MuscleId[] = ['isquiotibiales', 'aductores', 'cuadriceps'];

// Each side has: the 9:16 scene (same wall as the intro clip), its silhouette mask, a cut-out
// for small spots, where the body box sits inside the 1080×1920 scene, and its plates.
const SIDES: Record<Side, { scene: string; mask: string; cut: string; body: string; plates: Plate[] }> = {
  front: {
    scene: '/marcel-scene-front.webp', // last frame of /marcel-ready.mp4
    mask: '/marcel-mask-front.webp',
    cut: '/marcel-cut-front.webp',
    body: 'translate(194 278) scale(1.594)',
    plates: [
      { ids: ['hombros'], mirror: true, d: 'M95 190C70 186 38 196 24 222C14 244 14 276 22 300C40 296 58 284 68 262C78 240 88 214 95 190Z' },
      { ids: ['pectorales'], mirror: true, d: 'M162 206C142 199 119 195 100 198C91 221 81 247 74 271C84 292 105 305 130 305C143 305 154 301 162 295Z' },
      { ids: UPPER_ARM, mirror: true, d: 'M14 342C10 370 10 400 16 424C30 430 48 428 60 420C66 396 68 368 66 342C50 348 30 348 14 342Z' },
      { ids: ['antebrazos'], mirror: true, d: 'M14 434C6 462 4 492 10 520C22 524 36 522 46 516C54 490 58 460 58 432C44 438 28 440 14 434Z' },
      { ids: ['abdominales'], mirror: true, d: 'M122 316L162 316L162 528C146 522 130 500 126 470C123 420 121 366 122 316Z' },
      { ids: ['oblicuos'], mirror: true, d: 'M114 316C100 316 86 306 78 296C72 360 64 440 60 518C82 528 104 522 118 500C114 440 112 380 114 316Z' },
      { ids: THIGH_FRONT, mirror: true, shift: 7, soft: true, d: 'M46 566C44 620 48 680 56 730L134 730C142 680 148 620 150 572C116 560 76 558 46 566Z' },
      { ids: THIGH_FRONT, mirror: true, shift: 7, d: 'M56 734C58 754 61 772 64 788C82 796 106 794 124 784C128 768 131 750 134 734Z' },
      { ids: ['gemelos'], mirror: true, shift: 7, d: 'M66 815C60 842 62 866 70 880C82 884 96 882 104 878C112 858 116 838 114 814C98 820 80 820 66 815Z' },
    ],
  },
  back: {
    scene: '/marcel-scene-back.webp',
    mask: '/marcel-mask-back.webp',
    cut: '/marcel-cut-back.webp',
    body: 'translate(192 278) scale(1.605 1.594)',
    plates: [
      { ids: ['trapecio'], d: 'M167 172C140 180 108 190 84 200C110 214 140 240 167 300C194 240 224 214 250 200C226 190 194 180 167 172Z' },
      { ids: ['hombros'], mirror: true, d: 'M80 202C56 200 30 212 20 240C14 262 16 284 22 300C42 292 58 276 68 254C74 238 78 220 80 202Z' },
      { ids: ['dorsales'], mirror: true, d: 'M70 250C62 300 60 350 68 400C84 430 120 440 162 442L162 330C140 296 110 262 70 250Z' },
      { ids: ['lumbares'], mirror: true, d: 'M128 450L162 450L162 534L120 534C120 506 122 476 128 450Z' },
      { ids: UPPER_ARM, mirror: true, d: 'M10 336C6 366 8 398 14 424C28 430 46 428 58 420C62 394 62 364 58 338C42 344 26 344 10 336Z' },
      { ids: ['antebrazos'], mirror: true, d: 'M10 432C2 462 2 494 8 522C20 526 34 524 44 518C52 490 56 460 56 430C42 436 26 438 10 432Z' },
      { ids: ['gluteos'], mirror: true, d: 'M60 560C52 600 56 650 76 676C104 690 140 684 162 664L162 556C128 548 92 550 60 560Z' },
      { ids: THIGH_BACK, mirror: true, shift: 7, soft: true, d: 'M58 694C57 708 58 722 60 736L144 736C147 722 149 708 150 696C120 704 88 704 58 694Z' },
      { ids: THIGH_BACK, mirror: true, shift: 7, d: 'M60 740C63 762 67 782 72 800C90 806 112 804 126 796C133 778 139 758 143 740Z' },
      { ids: ['gemelos'], mirror: true, shift: 7, d: 'M66 814C56 840 58 866 68 882C82 888 98 886 110 880C120 858 122 836 118 812C100 820 82 820 66 814Z' },
    ],
  },
};

const BACK_ONLY: MuscleId[] = ['trapecio', 'dorsales', 'lumbares', 'gluteos', 'isquiotibiales'];
const FRONT_ONLY: MuscleId[] = ['pectorales', 'abdominales', 'oblicuos', 'cuadriceps', 'aductores', 'biceps'];

/** Which side of Marcel shows the routine better: the back only when it clearly works the back more. */
export function figureSide(muscles: MuscleSelection[]): Side {
  const primary = muscles.filter((m) => m.role === 'primary');
  const pool = primary.length > 0 ? primary : muscles;
  const back = pool.filter((m) => BACK_ONLY.includes(m.id)).length;
  const front = pool.filter((m) => FRONT_ONLY.includes(m.id)).length;
  return back > front ? 'back' : 'front';
}

export function MarcelFigure({
  muscles,
  variant = 'cutout',
  className = '',
}: {
  muscles: MuscleSelection[];
  variant?: 'scene' | 'cutout';
  className?: string;
}) {
  const uid = useId();
  const isScene = variant === 'scene';
  const side = SIDES[figureSide(muscles)];
  const mask = isScene ? side.mask : side.cut;
  const maskStyle = {
    maskImage: `url(${mask})`,
    WebkitMaskImage: `url(${mask})`,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
  };

  const roleOf = (plate: Plate) => {
    const hits = muscles.filter((m) => plate.ids.includes(m.id));
    return hits.some((m) => m.role === 'primary') ? 'primary' : hits.length > 0 ? 'secondary' : 'off';
  };
  // Every plate, plus its mirrored twin on the other half of the body.
  const each = (draw: (plate: Plate, key: string, flip: string | undefined) => ReactNode) =>
    side.plates.flatMap((plate, i) => {
      const nudge = plate.shift ? `translate(${plate.shift} 0)` : undefined;
      return [
        draw(plate, `${i}`, nudge),
        ...(plate.mirror ? [draw(plate, `${i}m`, `translate(334 0) scale(-1 1) ${nudge ?? ''}`)] : []),
      ];
    });
  const fade = (primary: boolean) => ({
    transition: 'opacity 0.8s ease',
    transitionDelay: primary ? '0.3s' : '0s',
  });
  const layer = (blend: string, children: ReactNode) => (
    <svg
      viewBox={isScene ? '0 0 1080 1920' : '0 0 334 1000'}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full ${blend}`}
      style={maskStyle}
    >
      <g transform={isScene ? side.body : undefined}>{children}</g>
    </svg>
  );

  // A soft tint inside each working muscle. Marcel's own silhouette is the outer edge, so the
  // colour has his real shape. Two passes keep the fabric visible: multiply dyes shirt and skin,
  // screen lifts red out of the black shorts.
  const tint = (fill: string, blend: string, strength: number) =>
    layer(
      blend,
      each((plate, key, flip) => {
        const role = roleOf(plate);
        return (
          <path
            key={key}
            d={plate.d}
            transform={flip}
            fill={fill}
            opacity={(role === 'primary' ? strength : role === 'secondary' ? strength * 0.3 : 0) * (plate.soft ? 0.2 : 1)}
            style={fade(role === 'primary')}
          />
        );
      }),
    );

  // Scan lines: fine arcs bowed like the limb they cross, so the colour reads as volume,
  // closed by a hairline where the muscle ends.
  const scan = layer(
    '',
    <>
      <defs>
        {side.plates.map((plate, i) => (
          <clipPath key={i} id={`${uid}c${i}`}>
            <path d={plate.d} />
          </clipPath>
        ))}
      </defs>
      {side.plates.flatMap((plate, i) => {
        const role = roleOf(plate);
        const nums = plate.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
        const xs = nums.filter((_, n) => n % 2 === 0);
        const ys = nums.filter((_, n) => n % 2 === 1);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const bow = Math.min(9, (x1 - x0) * 0.1);
        const arcs: string[] = [];
        for (let y = y0 - bow + 7; y < y1; y += 7) {
          arcs.push(`M${x0} ${y}Q${(x0 + x1) / 2} ${y + bow * 2} ${x1} ${y}`);
        }
        const nudge = plate.shift ? `translate(${plate.shift} 0)` : '';
        const draw = (key: string, transform: string) => (
          <g key={key} transform={transform} opacity={role === 'off' ? 0 : 1} style={fade(role === 'primary')}>
            <path
              d={arcs.join('')}
              clipPath={`url(#${uid}c${i})`}
              fill="none"
              stroke={RED}
              strokeWidth="0.9"
              vectorEffect="non-scaling-stroke"
              opacity={(role === 'primary' ? 0.75 : 0.35) * (plate.soft ? 0.7 : 1)}
            />
            <path
              d={plate.d}
              display={plate.soft ? 'none' : undefined}
              fill="none"
              stroke={RED}
              strokeWidth={role === 'primary' ? 1.5 : 1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={role === 'primary' ? 1 : 0.55}
            />
          </g>
        );
        return [
          draw(`${i}`, nudge),
          ...(plate.mirror ? [draw(`${i}m`, `translate(334 0) scale(-1 1) ${nudge}`)] : []),
        ];
      })}
    </>,
  );

  return (
    <div
      role="img"
      aria-label="Marcel, con los músculos de la rutina marcados en rojo"
      className={`relative isolate ${isScene ? 'aspect-[9/16]' : 'aspect-[334/1000]'} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- its silhouette doubles as the CSS mask */}
      <img
        src={isScene ? side.scene : side.cut}
        alt=""
        draggable={false}
        className={`h-full w-full select-none grayscale ${
          isScene
            ? 'object-cover brightness-[1.06] contrast-[1.04]'
            : 'drop-shadow-[0_14px_18px_rgba(0,0,0,0.22)]'
        }`}
      />
      {tint(RED, 'mix-blend-multiply', 0.5)}
      {tint('#c8190f', 'mix-blend-screen', 0.7)}
      {scan}
    </div>
  );
}
