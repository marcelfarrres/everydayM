import { MuscleSelector } from '@/components/workout/MuscleSelector';
import { DifficultyScale } from '@/components/ui/DifficultyScale';
import type { MuscleSelection } from '@/types/workout';
import { fieldClass } from '@/components/studio/StudioUi';

export type ClipType = 'workout' | 'warmup' | 'intro' | 'filler';

export const CLIP_TYPE_LABELS: Record<ClipType, string> = {
  workout: 'Entreno',
  warmup: 'Calentamiento',
  intro: 'Intro',
  filler: 'Relleno',
};

export const EQUIPMENT: Record<string, string> = {
  ninguno: 'Sin material',
  mancuernas: 'Mancuernas',
  bandas: 'Bandas elásticas',
  esterilla: 'Esterilla',
};

export type ClipFields = {
  title: string;
  type: ClipType;
  difficulty: number;
  muscles: MuscleSelection[];
  equipment: string;
};

export function toClipType(type: string): ClipType {
  return type === 'warmup' || type === 'intro' || type === 'filler' ? type : 'workout';
}

/** What is missing before a clip can be saved, or null. */
export function clipFieldsProblem(value: ClipFields): string | null {
  if (!value.title.trim()) return 'Ponle un nombre al ejercicio.';
  if (value.type === 'workout' && !value.muscles.some((m) => m.role === 'primary')) {
    return 'Marca al menos un músculo principal (toca dos veces una zona).';
  }
  return null;
}

/** Title, type, difficulty, muscles and equipment: the same form for a new clip and a saved one. */
export function ClipForm({ value, onChange }: { value: ClipFields; onChange: (patch: Partial<ClipFields>) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Nombre del ejercicio</span>
        <input type="text" value={value.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Ej. Flexiones diamante" className={fieldClass} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Tipo</span>
          <select value={value.type} onChange={(e) => onChange({ type: e.target.value as ClipType })} className={fieldClass}>
            {(Object.keys(CLIP_TYPE_LABELS) as ClipType[]).map((t) => (
              <option key={t} value={t}>{CLIP_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Material</span>
          <select value={value.equipment} onChange={(e) => onChange({ equipment: e.target.value })} className={fieldClass}>
            {Object.entries(EQUIPMENT).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <DifficultyScale value={value.difficulty} onChange={(difficulty) => onChange({ difficulty })} />
      {value.type === 'workout' && <MuscleSelector value={value.muscles} onChange={(muscles) => onChange({ muscles })} />}
    </div>
  );
}
