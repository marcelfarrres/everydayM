/*
 * The new rocket of the first screen (phone): its geometry as numbers, kept apart from the drawing
 * (PadRocket.tsx) so the bar, the drum and the tests share them. Lying down, nose to the right,
 * in px: x from the nozzle's mouth (0) to the antenna's light (`W`), y from the top fin's tip (0)
 * to the bottom fin's tip (`H`). The flame is drawn to the left of x = 0 (outside the box).
 *
 * Proportions follow the approved drawings (cohete-lámina for the tail, the hull and the hatch;
 * cohete-reproductor for the nose). Most details scale with `Tf`, the thickness the fins and
 * the tail are drawn for: the text bar's body grows with its lines (`T` > `Tf`) and keeps its fins.
 *
 * Also here: fitting a label inside its hull (`fitLabel`, never overflowing), and the text bar's
 * layout (`padBarLayout`).
 */

import { NOSE } from '@/components/workout/rocketPaths';

export const PAD_COLORS = {
  ink: '#131313',
  red: '#ff3b30',
  flameMid: '#ff8d86',
  hull: '#ffffff',
  shade: '#dcdad5',
  shadeDark: '#c4c2bb',
  rib: '#77756f',
  glass: '#c9d8e3',
} as const;

export interface PadRocketGeometry {
  /** box width (nozzle mouth to the antenna's light) and height (fin tip to fin tip), px */
  W: number;
  H: number;
  /** body thickness, and the thickness the fins and tail details are drawn for */
  T: number;
  Tf: number;
  /** vertical centre line */
  cy: number;
  stroke: number;
  fin: { h: number; x0: number; len: number };
  /** the body (hull): from the end of the nozzle to the base of the nose */
  body: { x0: number; x1: number; top: number; bottom: number };
  ring: { x: number; w: number };
  band: { x: number; w: number };
  checker: { x: number; w: number; cell: number };
  /** the seam and rivet column just before the nose */
  seam: { x: number; rivetX: number; rivetW: number };
  /** the belly's two-tone shading, from these y down to the bottom */
  belly: { light: number; dark: number };
  nose: { x0: number; len: number; tip: number };
  window: { cx: number; cy: number; r: number };
  antenna: { x0: number; x1: number; light: number };
  /** the crew hatch (door) near the nose, or null (the text bar has none) */
  hatch: { x: number; y: number; w: number; h: number } | null;
  /** where a label may be written, px along x */
  label: { x0: number; x1: number; baseline: number };
  /** flame length at full engine (flame = 1) */
  flameLen: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The approved nose (cohete-reproductor): it leaves the hull tangentially, tapers and ends in a
 * small rounded end in ink. In units of the body thickness: `len` from the hull to the rounded
 * end, then the antenna and its red light. (Shared with the routine's rocket: rocketPaths.ts.)
 */
export { NOSE };

/**
 * The geometry of a rocket `length` px long (the box: nozzle to antenna light), body `body` px
 * thick. `finRef`: the thickness the fins and tail are drawn for (the bar keeps its fins as its
 * body grows); `hatch`: draw the crew door near the nose.
 */
export function padRocketGeometry({
  length,
  body,
  finRef,
  hatch = true,
}: {
  length: number;
  body: number;
  finRef?: number;
  hatch?: boolean;
}): PadRocketGeometry {
  const T = Math.max(12, body);
  const Tf = Math.max(12, Math.min(T, finRef ?? T));
  const finH = round1(0.43 * Tf);
  const H = round1(T + 2 * finH);
  const cy = H / 2;
  const top = finH;
  const bottom = finH + T;
  const stroke = round1(Math.min(2, Math.max(1.3, 0.036 * Tf)));

  const nozzle = round1(0.36 * Tf);
  const x0 = nozzle;
  const ringW = round1(0.16 * Tf);
  const band = { x: round1(x0 + 0.25 * Tf), w: round1(0.143 * Tf) };
  const cell = round1(0.107 * Tf);
  const checker = { x: round1(band.x + band.w + 0.036 * Tf), w: round1(2 * cell), cell };

  // the nose: a slender ogive with a rounded tip, NOSE.len × Tf long, then the antenna and its light
  const antennaLen = round1(NOSE.antenna * Tf);
  const light = round1(NOSE.light * Tf);
  const noseLen = round1(NOSE.len * Tf);
  const tip = round1(length - antennaLen - 2 * light);
  const noseX0 = round1(tip - noseLen);
  const x1 = noseX0;

  const seamX = round1(x1 - 0.3 * Tf);
  const rivetW = round1(0.18 * Tf);
  const seam = { x: seamX, rivetX: round1(seamX + 0.04 * Tf), rivetW };

  const hatchW = round1(0.5 * Tf);
  const hatchH = round1(0.66 * Tf);
  const hatchBox = hatch ? { x: round1(seamX - 0.2 * Tf - hatchW), y: round1(cy - hatchH / 2), w: hatchW, h: hatchH } : null;

  const labelX0 = round1(checker.x + checker.w + 0.12 * Tf);
  const labelX1 = round1(hatchBox ? hatchBox.x - 0.18 * Tf : seamX - 0.15 * Tf);

  return {
    W: round1(length),
    H,
    T,
    Tf,
    cy,
    stroke,
    fin: { h: finH, x0: round1(x0 + 0.286 * Tf), len: round1(1.32 * Tf) },
    body: { x0, x1, top, bottom },
    ring: { x: x0, w: ringW },
    band,
    checker,
    seam,
    belly: { light: round1(bottom - 0.25 * Tf), dark: round1(bottom - 0.09 * Tf) },
    nose: { x0: noseX0, len: noseLen, tip },
    window: { cx: round1(noseX0 + 0.321 * Tf), cy: round1(cy - 0.071 * T), r: round1(0.143 * Tf) },
    antenna: { x0: tip, x1: round1(tip + antennaLen), light },
    hatch: hatchBox,
    label: { x0: labelX0, x1: Math.max(labelX0, labelX1), baseline: round1(top + 0.47 * T) },
    flameLen: round1(Tf),
  };
}

// ---------------------------------------------------------------------------------------------
// Labels that always fit their hull

/** Width of `text` at `px` font size. In the browser, a real measurement; here, an estimate. */
export type MeasureText = (text: string, px: number) => number;

/**
 * A slightly generous estimate of Geist semibold (em per character), used before the real font
 * can be measured (the server, the first paint) and in tests.
 */
export function estimateTextWidth(text: string, px: number): number {
  let em = 0;
  for (const ch of text) {
    if (/[ilj.,:;'!|íì]/.test(ch)) em += 0.3;
    else if (ch === ' ') em += 0.28;
    else if (/[frt()¿?]/.test(ch)) em += 0.4;
    else if (/[mwMW]/.test(ch)) em += 0.88;
    else if (/[A-ZÁÉÍÓÚÑ]/.test(ch)) em += 0.68;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else em += 0.57;
  }
  return em * px;
}

export interface LabelFit {
  /** what is written (the label, or the label cut with an ellipsis) */
  text: string;
  /** font size, px */
  px: number;
  /** px the rocket must grow to hold it (0: it fits as it is) */
  extra: number;
  cut: boolean;
}

/**
 * The biggest font size (from `max` down to `min`) at which `text` fits `room` px. If even `min`
 * does not fit, the rocket may grow up to `maxExtra` px; past that the label is cut with an
 * ellipsis. Whatever it returns fits: measure(text, px) ≤ room + extra.
 */
export function fitLabel(
  text: string,
  room: number,
  { max, min, maxExtra = 0, step = 0.25 }: { max: number; min: number; maxExtra?: number; step?: number },
  measure: MeasureText = estimateTextWidth,
): LabelFit {
  const clean = text.trim();
  const space = Math.max(0, room);
  const at = (px: number) => measure(clean, px);
  if (at(max) <= space) return { text: clean, px: max, extra: 0, cut: false };
  // widths scale with the size: start from the proportional guess, then step down until it fits
  let px = Math.floor(((max * space) / Math.max(1, at(max))) / step) * step;
  px = Math.min(max, px);
  while (px >= min && at(px) > space) px -= step;
  if (px >= min) return { text: clean, px: Math.round(px * 100) / 100, extra: 0, cut: false };
  const need = Math.ceil(at(min) - space);
  if (need <= maxExtra) return { text: clean, px: min, extra: need, cut: false };
  // cut it: as many characters as fit, then "…" (never a dangling space or comma before it)
  const limit = space + Math.max(0, maxExtra);
  let n = clean.length;
  let cutText = '…';
  while (n > 0) {
    const candidate = `${clean.slice(0, n).replace(/[\s,.;:·-]+$/u, '')}…`;
    if (measure(candidate, min) <= limit) {
      cutText = candidate;
      break;
    }
    n -= 1;
  }
  const extra = Math.max(0, Math.ceil(measure(cutText, min) - space));
  return { text: cutText, px: min, extra: Math.min(extra, Math.max(0, maxExtra)), cut: true };
}

// ---------------------------------------------------------------------------------------------
// The text bar (phone): the rocket is the bar, the field lies in its hull

export const PAD_BAR = {
  /** px per line of the sentence (18 px text), and of the field around its lines */
  LINE: 24,
  PAD: 10,
  MAX_LINES: 3,
  /** how far the nozzle and the antenna reach into the side margins, px */
  HANG_LEFT: 10,
  HANG_RIGHT: 10,
  /** tap targets */
  SEND_W: 44,
  MIC_W: 38,
  /** the typed text's size; the placeholder is as big as fits, up to this */
  TEXT_PX: 18,
  PLACEHOLDER_MIN: 11,
} as const;

export interface PadBarLayout {
  g: PadRocketGeometry;
  /** the bar's own box (the rocket reaches `hangLeft` beyond its left edge), px */
  height: number;
  hangLeft: number;
  /** where things sit, in the bar's own coordinates (px) */
  textLeft: number;
  textWidth: number;
  micLeft: number | null;
  sendLeft: number;
  ctlTop: number;
  discR: number;
  fieldTop: number;
  fieldHeight: number;
}

/** The bar's body thickness for `lines` lines of text, at a fin thickness of `tf`. */
export function padBarThickness(lines: number, tf: number): number {
  const n = Math.min(PAD_BAR.MAX_LINES, Math.max(1, Math.round(lines)));
  return Math.max(tf, n * PAD_BAR.LINE + 10);
}

/**
 * The text bar `barWidth` px wide (the form's width): the rocket, the field from right after the
 * checker strip to the microphone, the microphone and "send" in the front of the hull.
 */
export function padBarLayout(barWidth: number, lines: number, speech: boolean): PadBarLayout {
  const tf = Math.round(Math.min(46, Math.max(36, barWidth * 0.128)));
  const T = padBarThickness(lines, tf);
  const length = barWidth + PAD_BAR.HANG_LEFT + PAD_BAR.HANG_RIGHT;
  const g = padRocketGeometry({ length, body: T, finRef: tf, hatch: false });
  const hang = PAD_BAR.HANG_LEFT;
  const discR = round1(0.29 * tf);
  // "send": its ink disc just before the seam at the nose
  const discCx = g.seam.x - 0.06 * tf - discR;
  const sendLeft = round1(discCx - PAD_BAR.SEND_W / 2 - hang);
  const micLeft = speech ? round1(sendLeft - PAD_BAR.MIC_W) : null;
  const textLeft = round1(g.label.x0 - hang);
  const textRight = (micLeft ?? sendLeft) - 2;
  const lineCount = Math.min(PAD_BAR.MAX_LINES, Math.max(1, Math.round(lines)));
  const fieldHeight = lineCount * PAD_BAR.LINE + 2 * PAD_BAR.PAD;
  return {
    g,
    height: g.H,
    hangLeft: hang,
    textLeft,
    textWidth: Math.max(0, round1(textRight - textLeft)),
    micLeft,
    sendLeft,
    ctlTop: round1(g.cy - 22),
    discR,
    fieldTop: round1(g.cy - fieldHeight / 2),
    fieldHeight,
  };
}
