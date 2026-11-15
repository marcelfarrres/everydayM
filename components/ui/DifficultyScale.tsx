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
      <legend className="mb-2 block text-[13px] font-semibold text-ink/60">
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
              className={`flex h-10 min-w-0 items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                selected
                  ? 'bg-ink text-white'
                  : 'bg-ink/6 text-ink/70 hover:bg-ink/12'
              }`}
            >
              {level}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[12px] font-medium text-ink/45">
        <span>Fácil</span>
        <span>Difícil</span>
      </div>
    </fieldset>
  );
}
