import type { CSSProperties, ReactNode } from 'react';
import { PAD_COLORS as C, fitLabel, type MeasureText } from '@/components/workout/padRocketShape';
import { AntennaPart, FinsPart, FlameLayers, NosePart, NozzlePart, RivetsPart, TailPart, WindowPart } from '@/components/workout/RocketParts';
import { NOSE, f1, tailLivery } from '@/components/workout/rocketPaths';
import { LABEL, PIECE_UNITS, type AssemblyLayout, type PieceId } from '@/components/workout/assembly';

/*
 * The routine's rocket standing on the pad while it is built (phone, AssemblyScene): one piece at
 * a time, each its own box (so it can ride the truck and its lift on its own), drawn with the
 * app's rocket parts (RocketParts.tsx). Each piece is drawn lying, nose to the right, as PadRocket
 * draws its rocket, then turned nose up inside its box: its label then runs along the hull, read
 * from the bottom up, in the rockets' typeface. A piece not fitted yet is a faint dashed outline.
 */

const FONT = 'var(--font-display), var(--font-geist-sans), system-ui, sans-serif';

/** Where a piece's label may be written, along its hull (lying: px from its tail end). */
function labelRoom(piece: PieceId, L: AssemblyLayout): { x0: number; x1: number } {
  const { T } = L;
  const b = L.pieces[piece];
  if (piece === 'engine') {
    const x0 = PIECE_UNITS.nozzle * T;
    return { x0: tailLivery(x0, T).end + 0.12 * T, x1: b.len - 0.3 * T };
  }
  if (piece === 'nose') return { x0: 0.14 * T, x1: b.hull - 0.4 * T };
  return { x0: 0.14 * T, x1: b.len - 0.3 * T };
}

/** The label as written on `piece`: as big as fits (about half the hull at most), cut with "…" if it must. */
export function pieceLabel(piece: PieceId, L: AssemblyLayout, text: string, measure: MeasureText) {
  const room = labelRoom(piece, L);
  const fit = fitLabel(text, room.x1 - room.x0, { max: Math.round(LABEL.share * L.T), min: LABEL.min }, measure);
  return { ...fit, x: (room.x0 + room.x1) / 2 };
}

export function RocketPiece({
  piece,
  L,
  label,
  measure,
  ghost = false,
  ghostLight = false,
  className = '',
  style,
}: {
  piece: PieceId;
  L: AssemblyLayout;
  label: string;
  measure: MeasureText;
  /** not fitted yet: a faint dashed outline */
  ghost?: boolean;
  /** the outline in white (on the dark sky) instead of ink */
  ghostLight?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const { T, finH, box: Hb } = L;
  const b = L.pieces[piece];
  const top = finH;
  const bottom = finH + T;
  const cy = Hb / 2;
  const sw = f1(Math.min(2, Math.max(1.3, 0.036 * T)));
  const inner = { top: top + sw / 2, bottom: bottom - sw / 2 };
  const nozzle = f1(PIECE_UNITS.nozzle * T);
  const hullX0 = piece === 'engine' ? nozzle : 0;
  const hullX1 = piece === 'nose' ? b.hull : b.len;
  const belly = { light: f1(bottom - 0.25 * T), dark: f1(bottom - 0.09 * T) };
  const rivetR = f1(Math.max(0.8, 0.025 * T));
  const rivetGap = f1(0.2 * T);
  const text = ghost ? null : pieceLabel(piece, L, label, measure);

  const frame = (children: ReactNode) => (
    <svg
      aria-hidden="true"
      width={Hb}
      height={b.len}
      viewBox={`0 0 ${Hb} ${b.len}`}
      className={`absolute ${className}`}
      style={{ left: L.cx - Hb / 2, top: b.top, overflow: 'visible', ...style }}
      data-piece={piece}
    >
      {/* lying (x along the hull from its tail end, y across), turned nose up */}
      <g transform={`translate(0 ${b.len}) rotate(-90)`}>{children}</g>
    </svg>
  );

  if (ghost) {
    const dash = `${f1(sw * 3)} ${f1(sw * 2.5)}`;
    const stroke = ghostLight ? '#ffffff' : C.ink;
    return frame(
      <rect
        x={hullX0}
        y={top}
        width={f1(hullX1 - hullX0)}
        height={T}
        rx={3}
        fill="#ffffff"
        fillOpacity={0.16}
        stroke={stroke}
        strokeOpacity={0.6}
        strokeWidth={f1(sw * 0.8)}
        strokeDasharray={dash}
      />,
    );
  }

  const livery = tailLivery(hullX0, T);
  const seamX = f1(b.hull - 0.3 * T);
  const tip = f1(b.hull + NOSE.len * T);
  return frame(
    <>
      {piece === 'engine' && (
        // the flame: out until ignition (CSS: asm-flame, lit under [data-ignite])
        <g className="asm-flame" style={{ transformOrigin: `0px ${cy}px` }}>
          <g className="pad-flicker" style={{ transformOrigin: `0px ${cy}px` }}>
            <FlameLayers x={0} cy={cy} along={T * 1.3} across={T} />
          </g>
        </g>
      )}
      <g stroke={C.ink} strokeLinejoin="round">
        {piece === 'engine' && (
          <>
            <NozzlePart x0={nozzle} xm={0} cy={cy} Tf={T} sw={sw} tag={false} />
            <FinsPart fin={{ x0: f1(nozzle + 0.286 * T), len: f1(1.32 * T), h: finH }} top={top} bottom={bottom} sw={sw} tag={false} />
          </>
        )}
        <rect x={hullX0} y={top} width={f1(hullX1 - hullX0 + (piece === 'nose' ? 1 : 0))} height={T} rx={f1(Math.min(4, 0.08 * T))} fill={C.hull} strokeWidth={sw} />
        <rect x={hullX0 + sw / 2} y={belly.light} width={f1(hullX1 - hullX0 - sw)} height={f1(belly.dark - belly.light)} fill={C.shade} stroke="none" />
        <rect x={hullX0 + sw / 2} y={belly.dark} width={f1(hullX1 - hullX0 - sw)} height={f1(inner.bottom - belly.dark)} fill={C.shadeDark} stroke="none" />
        {piece === 'engine' && <TailPart ring={livery.ring} band={livery.band} checker={livery.checker} top={top} T={T} inner={inner} sw={sw} tag={false} />}
        {piece === 'nose' ? (
          <>
            <RivetsPart seamX={seamX} rivetX={f1(seamX + 0.04 * T + 0.09 * T)} inner={inner} r={rivetR} gap={rivetGap} inset={0.12 * T} tag={false} />
            <NosePart x1={b.hull} top={top} bottom={bottom} cy={cy} T={T} Tf={T} sw={sw} tag={false} />
            <WindowPart w={{ cx: f1(b.hull + 0.321 * T), cy: f1(cy - 0.071 * T), r: f1(0.143 * T) }} sw={sw} tag={false} />
            <AntennaPart x0={tip} x1={f1(tip + NOSE.antenna * T)} light={f1(NOSE.light * T)} cy={cy} Tf={T} sw={sw} tag={false} />
          </>
        ) : (
          // the rivets at its top seam, where the mechanics bolt it to the piece above
          <RivetsPart seamX={null} rivetX={f1(hullX1 - 0.12 * T)} inner={inner} r={rivetR} gap={rivetGap} inset={0.12 * T} tag={false} />
        )}
      </g>
      {text && text.text && (
        <text
          x={f1(text.x)}
          y={f1(top + 0.44 * T)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={C.ink}
          style={{ fontFamily: FONT, fontSize: `${text.px}px`, fontWeight: 600 }}
        >
          {text.text}
        </text>
      )}
    </>,
  );
}
