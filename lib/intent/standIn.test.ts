import { describe, expect, it } from 'vitest';
import { exercise } from '@/lib/routine/fixtures.test-helpers';
import { standInExercise } from './standIn';

const catalog = [
  exercise('sentadilla', ['cuadriceps', 'gluteos']),
  exercise('plancha', ['abdominales', 'oblicuos']),
  exercise('flexiones', ['pectorales', 'triceps']),
  exercise('curl', ['biceps']),
  exercise('burpee', ['cuadriceps', 'pectorales', 'hombros', 'abdominales', 'gluteos']),
  exercise('press-hombro', ['hombros']),
  exercise('estiramiento', ['cuadriceps', 'gluteos'], { type: 'warmup' }),
];

describe('the porthole stand-in clip', () => {
  it('picks a clip that works what the suggestion asks for', () => {
    expect(standInExercise('Pecho y tríceps, 30 min', catalog)?.id).toBe('flexiones');
    expect(standInExercise('Hombros, 20 min', catalog)?.id).toBe('press-hombro');
    expect(standInExercise('Abdominales, 20 min', catalog)?.id).toBe('plancha');
    expect(standInExercise('Cuádriceps y glúteos, 30 min', catalog)?.id).toBe('sentadilla');
  });

  it('never picks a warm-up, and gives nothing when nothing fits', () => {
    const warmOnly = [exercise('estiramiento', ['cuadriceps'], { type: 'warmup' })];
    expect(standInExercise('Cuádriceps, 20 min', warmOnly)).toBeNull();
    expect(standInExercise('Bíceps y tríceps, 20 min', [exercise('sentadilla', ['cuadriceps'])])).toBeNull();
    expect(standInExercise('Piernas, 30 min', [])).toBeNull();
  });

  it('is stable: the same suggestion always shows the same clip', () => {
    const a = standInExercise('Full body, 30 min', catalog);
    expect(a).not.toBeNull();
    for (let i = 0; i < 5; i++) expect(standInExercise('Full body, 30 min', [...catalog].reverse())?.id).toBe(a?.id);
  });
});
