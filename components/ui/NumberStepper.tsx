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
    <div className="rounded-2xl border border-[#22c55e]/20 bg-[#141b16] p-3.5">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Reducir ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white transition-colors hover:border-[#4ade80]/50 hover:text-[#4ade80] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="text-center" aria-live="polite">
          <span className="block text-3xl font-black leading-none text-white">{value}</span>
          <span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            {unit}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 text-[#4ade80] transition-colors hover:bg-[#22c55e]/20 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-center text-[9px] text-neutral-500">
        De {min} a {max}
      </p>
    </div>
  );
}
