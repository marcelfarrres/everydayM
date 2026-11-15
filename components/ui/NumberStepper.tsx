'use client';

import { Minus, Plus } from 'lucide-react';

export function NumberStepper({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-3.5">
      <p className="text-[13px] font-semibold text-ink/60">
        {label}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Reducir ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/6 text-ink transition-colors hover:bg-ink/12 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="text-center" aria-live="polite">
          <span className="block text-3xl font-semibold leading-none tabular-nums text-ink">{value}</span>
          <span className="mt-1 block text-[12px] font-medium text-ink/55">
            {unit}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-center text-[12px] text-ink/45">
        De {min} a {max}
      </p>
    </div>
  );
}
