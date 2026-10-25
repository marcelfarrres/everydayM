'use client';

export function DifficultyScale({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 block text-[10px] font-black uppercase tracking-[0.15em] text-neutral-400">
        Dificultad · {value}/10
      </legend>
      <div
        role="group"
        aria-label="Nivel de dificultad del 1 al 10"
        className="grid grid-cols-10 gap-1"
      >
        {Array.from({ length: 10 }, (_, index) => {
          const level = index + 1;
          const selected = level === value;

          return (
            <button
              key={level}
              type="button"
              aria-label={`Dificultad ${level} de 10`}
              aria-pressed={selected}
              onClick={() => onChange(level)}
              className={`flex h-10 min-w-0 items-center justify-center rounded-lg border text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ade80] ${
                selected
                  ? 'border-[#4ade80] bg-[#22c55e] text-black'
                  : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-[#4ade80]/60 hover:text-white'
              }`}
            >
              {level}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-neutral-500">
        <span>Fácil</span>
        <span>Difícil</span>
      </div>
    </fieldset>
  );
}
