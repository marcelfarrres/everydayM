import { fitLabel, type LabelFit, type MeasureText } from '@/components/workout/padRocketShape';

/*
 * The drum rockets' labels (phone): as big as fits, like every label (fitLabel), but when even the
 * smallest size does not fit, the sentence is shortened in the middle so its minutes stay:
 * «Piernas y glúteos, 30 min» → «Piernas y gl…, 30 min». Pure.
 */

const MINUTES_TAIL = /^(.*\S)(,\s*\d+\s*min)$/u;

export function fitDrumLabel(
  text: string,
  room: number,
  opts: { max: number; min: number },
  measure: MeasureText,
): LabelFit {
  const plain = fitLabel(text, room, opts, measure);
  if (!plain.cut) return plain;
  const parts = MINUTES_TAIL.exec(text.trim());
  if (!parts) return plain;
  const [, head, tail] = parts;
  // as much of the head as fits, then «…», then the minutes (never a dangling space or comma)
  for (let n = head.length - 1; n >= 1; n--) {
    const kept = head.slice(0, n).replace(/[\s,.;:·-]+$/u, '');
    if (!kept) continue;
    const candidate = `${kept}…${tail}`;
    if (measure(candidate, opts.min) <= room) return { text: candidate, px: opts.min, extra: 0, cut: true };
  }
  return plain;
}
