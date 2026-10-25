'use client';

import type {
  MuscleId,
  MuscleRegion,
  MuscleRole,
  MuscleSelection,
} from '@/types/workout';

export type { MuscleId, MuscleRegion, MuscleRole, MuscleSelection };

const LEGACY_MUSCLE_BY_ID: Record<MuscleId, string> = {
  pectorales: 'pecho',
  hombros: 'brazos',
  biceps: 'brazos',
  antebrazos: 'brazos',
  abdominales: 'core',
  oblicuos: 'core',
  cuadriceps: 'piernas',
  aductores: 'piernas',
  gemelos: 'piernas',
  trapecio: 'espalda',
  dorsales: 'espalda',
  triceps: 'brazos',
  lumbares: 'espalda',
  gluteos: 'piernas',
  isquiotibiales: 'piernas',
};

const ARM_MUSCLES: MuscleId[] = ['hombros', 'biceps', 'triceps', 'antebrazos'];
const LEG_MUSCLES: MuscleId[] = [
  'cuadriceps',
  'aductores',
  'isquiotibiales',
  'gemelos',
];
const CHEST_MUSCLES: MuscleId[] = ['pectorales'];
const BACK_MUSCLES: MuscleId[] = ['trapecio', 'dorsales', 'lumbares'];
const ABS_MUSCLES: MuscleId[] = ['abdominales', 'oblicuos'];
const GLUTE_MUSCLES: MuscleId[] = ['gluteos'];

const MUSCLE_GROUPS = [
  { label: 'Piernas', ids: LEG_MUSCLES },
  { label: 'Brazos', ids: ARM_MUSCLES },
  { label: 'Pecho', ids: CHEST_MUSCLES },
  { label: 'Espalda', ids: BACK_MUSCLES },
  { label: 'Abdominales', ids: ABS_MUSCLES },
  { label: 'Glúteos', ids: GLUTE_MUSCLES },
];

const MUSCLE_IDS: MuscleId[] = MUSCLE_GROUPS.flatMap((group) => group.ids);

export function getLegacyMuscle(muscleId: MuscleId): string {
  return LEGACY_MUSCLE_BY_ID[muscleId];
}

export function getExerciseMuscles(
  value: unknown,
  legacyMuscle?: string | null,
): MuscleSelection[] {
  if (Array.isArray(value)) {
    const selections = value.filter(
      (entry): entry is MuscleSelection =>
        typeof entry === 'object' &&
        entry !== null &&
        'id' in entry &&
        MUSCLE_IDS.includes(entry.id as MuscleId) &&
        'role' in entry &&
        (entry.role === 'primary' || entry.role === 'secondary'),
    );

    if (selections.length > 0) return selections;
  }

  const legacyId: Partial<Record<string, MuscleId>> = {
    pecho: 'pectorales',
    espalda: 'dorsales',
    piernas: 'cuadriceps',
    brazos: 'biceps',
    core: 'abdominales',
  };
  const fallbackId = legacyMuscle ? legacyId[legacyMuscle.toLowerCase()] : undefined;

  return fallbackId ? [{ id: fallbackId, role: 'primary' }] : [];
}

const FRONT_REGIONS: MuscleRegion[] = [
  { ids: ARM_MUSCLES, label: 'Brazos', d: 'M65 56 C57 57 52 62 49 72 C46 83 46 96 45 108 L42 130 C41 139 43 149 47 159 L51 168 C53 170 56 168 56 165 L54 153 C52 146 54 138 57 130 L65 108 L70 82 L75 67 Z M115 56 C123 57 128 62 131 72 C134 83 134 96 135 108 L138 130 C139 139 137 149 133 159 L129 168 C127 170 124 168 124 165 L126 153 C128 146 126 138 123 130 L115 108 L110 82 L105 67 Z' },
  { ids: CHEST_MUSCLES, label: 'Pecho', d: 'M70 65 C76 62 83 64 89 68 L89 96 C81 97 73 94 68 89 Z M110 65 C104 62 97 64 91 68 L91 96 C99 97 107 94 112 89 Z' },
  { ids: ABS_MUSCLES, label: 'Abdominales', d: 'M69 98 C75 100 82 101 89 99 L89 143 C82 144 75 142 69 138 Z M111 98 C105 100 98 101 91 99 L91 143 C98 144 105 142 111 138 Z' },
  { ids: LEG_MUSCLES, label: 'Piernas', d: 'M68 149 C74 151 82 153 89 152 L89 198 C89 214 85 228 83 241 L82 282 L68 282 L69 241 C68 226 63 213 63 198 L63 165 C64 159 66 153 68 149 Z M112 149 C106 151 98 153 91 152 L91 198 C91 214 95 228 97 241 L98 282 L112 282 L111 241 C112 226 117 213 117 198 L117 165 C116 159 114 153 112 149 Z' },
];

const BACK_REGIONS: MuscleRegion[] = [
  { ids: ARM_MUSCLES, label: 'Brazos', d: 'M65 56 C57 57 52 62 49 72 C46 83 46 96 45 108 L42 130 C41 139 43 149 47 159 L51 168 C53 170 56 168 56 165 L54 153 C52 146 54 138 57 130 L65 108 L70 82 L75 67 Z M115 56 C123 57 128 62 131 72 C134 83 134 96 135 108 L138 130 C139 139 137 149 133 159 L129 168 C127 170 124 168 124 165 L126 153 C128 146 126 138 123 130 L115 108 L110 82 L105 67 Z' },
  { ids: BACK_MUSCLES, label: 'Espalda', d: 'M70 52 C76 49 83 49 90 51 C97 49 104 49 110 52 C117 54 121 61 121 70 L116 96 C114 108 114 124 115 138 C112 147 106 153 101 155 L79 155 C74 153 68 147 65 138 C66 124 66 108 64 96 L59 70 C59 61 63 54 70 52 Z' },
  { ids: GLUTE_MUSCLES, label: 'Glúteos', d: 'M68 146 C74 143 82 145 89 150 L89 174 C83 180 74 181 67 175 Z M112 146 C106 143 98 145 91 150 L91 174 C97 180 106 181 113 175 Z' },
  { ids: LEG_MUSCLES, label: 'Piernas', d: 'M67 177 C74 175 82 176 89 179 L89 198 C89 214 85 228 83 241 L82 282 L68 282 L69 241 C68 226 63 213 63 198 L63 183 Z M113 177 C106 175 98 176 91 179 L91 198 C91 214 95 228 97 241 L98 282 L112 282 L111 241 C112 226 117 213 117 198 L117 183 Z' },
];

function BodyBase() {
  return (
    <g
      fill="#303a33"
      stroke="#89968c"
      strokeWidth="1.8"
      strokeLinejoin="round"
      pointerEvents="none"
    >
      <circle cx="90" cy="24" r="13" />
      <path d="M83 38 L97 38 L99 51 L81 51 Z" />
      <path d="M70 52 C76 49 83 49 90 51 C97 49 104 49 110 52 C117 54 121 61 121 70 L116 96 C114 108 114 124 115 138 C112 147 106 153 101 155 L79 155 C74 153 68 147 65 138 C66 124 66 108 64 96 L59 70 C59 61 63 54 70 52 Z" />
      <path d="M65 56 C57 57 52 62 49 72 C46 83 46 96 45 108 L42 130 C41 139 43 149 47 159 L51 168 C53 170 56 168 56 165 L54 153 C52 146 54 138 57 130 L65 108 L70 82 Z" />
      <path d="M115 56 C123 57 128 62 131 72 C134 83 134 96 135 108 L138 130 C139 139 137 149 133 159 L129 168 C127 170 124 168 124 165 L126 153 C128 146 126 138 123 130 L115 108 L110 82 Z" />
      <path d="M68 149 C74 151 82 153 89 152 L89 198 C89 214 85 228 83 241 L82 282 L68 282 L69 241 C68 226 63 213 63 198 L63 165 C64 159 66 153 68 149 Z" />
      <path d="M112 149 C106 151 98 153 91 152 L91 198 C91 214 95 228 97 241 L98 282 L112 282 L111 241 C112 226 117 213 117 198 L117 165 C116 159 114 153 112 149 Z" />
      <path d="M68 282 L82 282 L83 294 L66 294 Q64 291 65 287 Z" />
      <path d="M112 282 L98 282 L97 294 L114 294 Q116 291 115 287 Z" />
    </g>
  );
}

function MuscleDetails({ side }: { side: 'Frente' | 'Espalda y glúteos' }) {
  const details =
    side === 'Frente'
      ? [
          'M68 71 C73 68 80 68 88 71 M92 71 C100 68 107 68 112 71',
          'M90 101 L90 142',
          'M64 82 C61 95 59 108 57 120 M116 82 C119 95 121 108 123 120',
          'M76 165 C75 185 76 207 75 230 M104 165 C105 185 104 207 105 230',
        ]
      : [
          'M90 53 L90 83',
          'M72 70 C77 76 82 80 86 84 M108 70 C103 76 98 80 94 84',
          'M90 87 L90 142',
          'M76 185 C75 202 76 216 75 230 M104 185 C105 202 104 216 105 230',
        ];

  return (
    <g
      fill="none"
      stroke="#526056"
      strokeWidth="1.5"
      strokeLinecap="round"
      pointerEvents="none"
    >
      {details.map((d) => <path key={d} d={d} />)}
    </g>
  );
}

function AnatomyView({
  side,
  regions,
  value,
  onChange,
}: {
  side: 'Frente' | 'Espalda y glúteos';
  regions: MuscleRegion[];
  value: MuscleSelection[];
  onChange: (next: MuscleSelection[]) => void;
}) {
  const handleRegionClick = (region: MuscleRegion) => {
    const selected = region.ids.map((id) =>
      value.find((selection) => selection.id === id),
    );
    const nextRole: MuscleRole | null = selected.every((selection) => !selection)
      ? 'secondary'
      : selected.some((selection) => selection?.role === 'secondary')
        ? 'primary'
        : null;
    const next = value.filter((selection) => !region.ids.includes(selection.id));

    if (nextRole) {
      next.push(...region.ids.map((id) => ({ id, role: nextRole })));
    }
    onChange(next);
  };

  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-[#111713] p-2">
      <p className="text-center text-[9px] font-black uppercase tracking-[0.12em] text-neutral-300">
        {side}
      </p>
      <svg
        viewBox="0 0 180 310"
        role="img"
        aria-label={`Figura anatómica ${side.toLowerCase()}; toca un grupo muscular para marcarlo`}
        className="mx-auto h-60 w-full max-w-[180px] select-none"
      >
        <g transform="translate(-13.5 0) scale(1.15 1)">
          <BodyBase />
          {regions.map((region) => {
            const selections = region.ids.map((id) =>
              value.find((entry) => entry.id === id),
            );
            const selection = selections.find(Boolean);
            const label = region.label;
            const stateLabel = selection
              ? selection.role === 'primary'
                ? 'principal'
                : 'secundario'
              : 'sin marcar';

            return (
              <path
                key={region.ids.join('-')}
                d={region.d}
                role="button"
                tabIndex={0}
                aria-label={`${label}, ${stateLabel}`}
                aria-pressed={selections.some(Boolean)}
                pointerEvents="visiblePainted"
                onClick={() => handleRegionClick(region)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleRegionClick(region);
                  }
                }}
                className="cursor-pointer transition-colors hover:brightness-125 focus:outline-none focus:brightness-125"
                fill={
                  selection?.role === 'primary'
                    ? '#22c55e'
                    : selection?.role === 'secondary'
                      ? '#facc15'
                      : '#8b9890'
                }
                fillOpacity={selection ? 0.96 : 0.86}
                stroke={selection ? '#f0fdf4' : '#d0d8d1'}
                strokeWidth={selection ? 1.6 : 1.2}
                strokeLinejoin="round"
              >
                <title>{`${label}: ${stateLabel}. Toca para cambiar.`}</title>
              </path>
            );
          })}
          <MuscleDetails side={side} />
        </g>
      </svg>
    </div>
  );
}

export function MuscleSelector({
  value,
  onChange,
}: {
  value: MuscleSelection[];
  onChange: (next: MuscleSelection[]) => void;
}) {
  const selectedIds = new Set(value.map((selection) => selection.id));
  const selectedMuscles = MUSCLE_GROUPS.filter((group) =>
    group.ids.some((id) => selectedIds.has(id)),
  );

  return (
    <section aria-label="Selección de músculos" className="space-y-2">
      <div>
        <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-400">
          Músculos a trabajar
        </h2>
        <p className="mt-1 text-[10px] text-neutral-500">
          Toca una zona: secundario · principal · quitar
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <AnatomyView
          side="Frente"
          regions={FRONT_REGIONS}
          value={value}
          onChange={onChange}
        />
        <AnatomyView
          side="Espalda y glúteos"
          regions={BACK_REGIONS}
          value={value}
          onChange={onChange}
        />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-bold uppercase tracking-wide text-neutral-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-yellow-400" /> Participa
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" /> Principal
        </span>
        {selectedMuscles.length > 0 && (
          <span className="w-full text-neutral-300">
            Seleccionados: {selectedMuscles.map((group) => {
              const isPrimary = group.ids.some((id) =>
                value.some((entry) => entry.id === id && entry.role === 'primary'),
              );
              return `${group.label}${isPrimary ? ' (principal)' : ''}`;
            }).join(', ')}
          </span>
        )}
      </div>
    </section>
  );
}
