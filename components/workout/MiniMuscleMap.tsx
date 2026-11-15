'use client';

import type { MuscleId, MuscleRegion, MuscleSelection } from '@/types/workout';

export const MUSCLE_LABELS: Record<MuscleId, string> = {
  pectorales: 'Pectorales',
  hombros: 'Hombros',
  biceps: 'Bíceps',
  antebrazos: 'Antebrazos',
  abdominales: 'Abdominales',
  oblicuos: 'Oblicuos',
  cuadriceps: 'Cuádriceps',
  aductores: 'Aductores',
  gemelos: 'Gemelos',
  trapecio: 'Trapecio',
  dorsales: 'Dorsales',
  triceps: 'Tríceps',
  lumbares: 'Lumbares',
  gluteos: 'Glúteos',
  isquiotibiales: 'Isquiotibiales',
};

export const ALL_MUSCLE_IDS: MuscleId[] = Object.keys(MUSCLE_LABELS) as MuscleId[];

const ARM_MUSCLES: MuscleId[] = ['biceps', 'triceps', 'antebrazos'];
const SHOULDER_MUSCLES: MuscleId[] = ['hombros'];
const SHOULDER_REGION: MuscleRegion = {
  ids: SHOULDER_MUSCLES,
  label: 'Hombros',
  d: 'M65 56 C57 57 52 62 49 72 L50 81 C56 76 64 74 70 72 L75 67 Z M115 56 C123 57 128 62 131 72 L130 81 C124 76 116 74 110 72 L105 67 Z',
};
const LEG_MUSCLES: MuscleId[] = ['cuadriceps', 'aductores', 'isquiotibiales', 'gemelos'];
const CHEST_MUSCLES: MuscleId[] = ['pectorales'];
const BACK_MUSCLES: MuscleId[] = ['trapecio', 'dorsales', 'lumbares'];
const ABS_MUSCLES: MuscleId[] = ['abdominales', 'oblicuos'];
const GLUTE_MUSCLES: MuscleId[] = ['gluteos'];

const FRONT_REGIONS: MuscleRegion[] = [
  {
    ids: ARM_MUSCLES,
    label: 'Brazos',
    d: 'M65 56 C57 57 52 62 49 72 C46 83 46 96 45 108 L42 130 C41 139 43 149 47 159 L51 168 C53 170 56 168 56 165 L54 153 C52 146 54 138 57 130 L65 108 L70 82 L75 67 Z M115 56 C123 57 128 62 131 72 C134 83 134 96 135 108 L138 130 C139 139 137 149 133 159 L129 168 C127 170 124 168 124 165 L126 153 C128 146 126 138 123 130 L115 108 L110 82 L105 67 Z',
  },
  {
    ids: CHEST_MUSCLES,
    label: 'Pecho',
    d: 'M70 65 C76 62 83 64 89 68 L89 96 C81 97 73 94 68 89 Z M110 65 C104 62 97 64 91 68 L91 96 C99 97 107 94 112 89 Z',
  },
  {
    ids: ABS_MUSCLES,
    label: 'Abdominales',
    d: 'M69 98 C75 100 82 101 89 99 L89 143 C82 144 75 142 69 138 Z M111 98 C105 100 98 101 91 99 L91 143 C98 144 105 142 111 138 Z',
  },
  {
    ids: LEG_MUSCLES,
    label: 'Piernas',
    d: 'M68 149 C74 151 82 153 89 152 L89 198 C89 214 85 228 83 241 L82 282 L68 282 L69 241 C68 226 63 213 63 198 L63 165 C64 159 66 153 68 149 Z M112 149 C106 151 98 153 91 152 L91 198 C91 214 95 228 97 241 L98 282 L112 282 L111 241 C112 226 117 213 117 198 L117 165 C116 159 114 153 112 149 Z',
  },
  SHOULDER_REGION,
];

const BACK_REGIONS: MuscleRegion[] = [
  {
    ids: ARM_MUSCLES,
    label: 'Brazos',
    d: 'M65 56 C57 57 52 62 49 72 C46 83 46 96 45 108 L42 130 C41 139 43 149 47 159 L51 168 C53 170 56 168 56 165 L54 153 C52 146 54 138 57 130 L65 108 L70 82 L75 67 Z M115 56 C123 57 128 62 131 72 C134 83 134 96 135 108 L138 130 C139 139 137 149 133 159 L129 168 C127 170 124 168 124 165 L126 153 C128 146 126 138 123 130 L115 108 L110 82 L105 67 Z',
  },
  {
    ids: BACK_MUSCLES,
    label: 'Espalda',
    d: 'M70 52 C76 49 83 49 90 51 C97 49 104 49 110 52 C117 54 121 61 121 70 L116 96 C114 108 114 124 115 138 C112 147 106 153 101 155 L79 155 C74 153 68 147 65 138 C66 124 66 108 64 96 L59 70 C59 61 63 54 70 52 Z',
  },
  {
    ids: GLUTE_MUSCLES,
    label: 'Glúteos',
    d: 'M68 146 C74 143 82 145 89 150 L89 174 C83 180 74 181 67 175 Z M112 146 C106 143 98 145 91 150 L91 174 C97 180 106 181 113 175 Z',
  },
  {
    ids: LEG_MUSCLES,
    label: 'Piernas',
    d: 'M67 177 C74 175 82 176 89 179 L89 198 C89 214 85 228 83 241 L82 282 L68 282 L69 241 C68 226 63 213 63 198 L63 183 Z M113 177 C106 175 98 176 91 179 L91 198 C91 214 95 228 97 241 L98 282 L112 282 L111 241 C112 226 117 213 117 198 L117 183 Z',
  },
  SHOULDER_REGION,
];

const TONES = {
  brand: {
    base: '#1c251f', baseStroke: '#5a6b5e',
    primary: '#22c55e', primaryStroke: '#bbf7d0',
    secondary: '#facc15', secondaryStroke: '#fef08a',
    idle: '#2a362e', idleStroke: '#47584c',
  },
  // heat: the muscle that works hardest glows red
  heat: {
    base: '#171a26', baseStroke: '#444b63',
    primary: '#ff4b3e', primaryStroke: '#ffd0cb',
    secondary: '#8a3a3a', secondaryStroke: '#c56a66',
    idle: '#222637', idleStroke: '#3a4058',
  },
} as const;

export type MuscleMapTone = keyof typeof TONES;

function MiniBodySilhouette({
  regions,
  muscles,
  label,
  heightClass,
  tone,
}: {
  regions: MuscleRegion[];
  muscles: MuscleSelection[];
  label: string;
  heightClass: string;
  tone: MuscleMapTone;
}) {
  const c = TONES[tone];
  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 180 310"
        role="img"
        aria-label={`Mapa muscular ${label}`}
        className={`${heightClass} w-auto select-none`}
      >
        <g transform="translate(-13.5 0) scale(1.15 1)">
          <g
            fill={c.base}
            stroke={c.baseStroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          >
            <circle cx="90" cy="24" r="13" />
            <path d="M83 38 L97 38 L99 51 L81 51 Z" />
            <path d="M70 52 C76 49 83 49 90 51 C97 49 104 49 110 52 C117 54 121 61 121 70 L116 96 C114 108 114 124 115 138 C112 147 106 153 101 155 L79 155 C74 153 68 147 65 138 C66 124 66 108 64 96 L59 70 C59 61 63 54 70 52 Z" />
            <path d="M65 56 C57 57 52 62 49 72 C46 83 46 96 45 108 L42 130 C41 139 43 149 47 159 L51 168 C53 170 56 168 56 165 L54 153 C52 146 54 138 57 130 L65 108 L70 82 Z" />
            <path d="M115 56 C123 57 128 62 131 72 C134 83 134 96 135 108 L138 130 C139 139 137 149 133 159 L129 168 C127 170 124 168 124 165 L126 153 C128 146 126 138 123 130 L115 108 L110 82 Z" />
            <path d="M68 149 C74 151 82 153 89 152 L89 198 C89 214 85 228 83 241 L82 282 L68 282 L69 241 C68 226 63 213 63 198 L63 165 C64 159 66 153 68 149 Z" />
            <path d="M112 149 C106 151 98 153 91 152 L91 198 C91 214 95 228 97 241 L98 282 L112 282 L111 241 C112 226 117 213 117 198 L117 165 C116 159 114 153 112 149 Z" />
          </g>
          {regions.map((region) => {
            const matched = region.ids
              .map((id) => muscles.find((m) => m.id === id))
              .filter((m): m is MuscleSelection => Boolean(m));
            const isPrimary = matched.some((m) => m.role === 'primary');
            const isSecondary = !isPrimary && matched.length > 0;

            return (
              <path
                key={region.ids.join('-')}
                d={region.d}
                fill={isPrimary ? c.primary : isSecondary ? c.secondary : c.idle}
                fillOpacity={isPrimary ? 0.98 : isSecondary ? 0.9 : 0.55}
                stroke={
                  isPrimary
                    ? c.primaryStroke
                    : isSecondary
                      ? c.secondaryStroke
                      : c.idleStroke
                }
                style={{
                  transition:
                    'fill 0.7s ease, stroke 0.7s ease, fill-opacity 0.7s ease',
                  transitionDelay: isPrimary ? '0.35s' : '0s',
                }}
                strokeWidth={isPrimary || isSecondary ? 2.2 : 1}
                strokeLinejoin="round"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export function MiniMuscleMap({
  muscles,
  size = 'md',
  showLegend = false,
  className = '',
  tone = 'brand',
  heightClassName,
}: {
  muscles: MuscleSelection[];
  size?: 'sm' | 'md' | 'lg';
  showLegend?: boolean;
  className?: string;
  tone?: MuscleMapTone;
  heightClassName?: string;
}) {
  const heightClass =
    heightClassName ?? (size === 'sm' ? 'h-20' : size === 'lg' ? 'h-36' : 'h-28');

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <div className="flex items-center justify-center gap-2">
        <MiniBodySilhouette
          regions={FRONT_REGIONS}
          muscles={muscles}
          label="frontal"
          heightClass={heightClass}
          tone={tone}
        />
        <MiniBodySilhouette
          regions={BACK_REGIONS}
          muscles={muscles}
          label="posterior"
          heightClass={heightClass}
          tone={tone}
        />
      </div>
      {showLegend && (
        <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-neutral-300">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Principal
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#facc15]" /> Secundario
          </span>
        </div>
      )}
    </div>
  );
}
