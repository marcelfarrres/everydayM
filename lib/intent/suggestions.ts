/*
 * Sentences the routine creator suggests under its bar: three at random each time, from this local
 * bank (no model). Each names muscles the catalogue has, a length the creator allows (20–40 min)
 * and, often, an intensity; the local keyword parser understands every one (suggestions.test.ts).
 */

export const SUGGESTIONS = [
  'Full body, 30 min',
  'Hombros, 20 min',
  'Piernas intenso, 40 min',
  'Glúteos y piernas, 30 min',
  'Espalda y bíceps, 35 min',
  'Pecho y tríceps, 30 min',
  'Core suave, 20 min',
  'Abdominales, 20 min',
  'Tren superior, 30 min',
  'Tren inferior intenso, 35 min',
  'Brazos, 25 min',
  'Glúteos suave, 25 min',
  'Cuádriceps y glúteos, 30 min',
  'Isquios y glúteos, 30 min',
  'Espalda suave, 30 min',
  'Hombros y brazos, 25 min',
  'Pecho intenso, 20 min',
  'Full body suave, 25 min',
  'Full body intenso, 40 min',
  'Piernas y core, 35 min',
  'Oblicuos y abdominales, 20 min',
  'Gemelos y piernas, 25 min',
  'Dorsales y bíceps, 30 min',
  'Tríceps y hombros, 25 min',
  'Empuje, 30 min',
  'Tirón, 30 min',
  'Glúteos intenso, 40 min',
  'Core y espalda, 25 min',
  'Tren superior suave, 20 min',
  'Piernas suave, 30 min',
  'Aductores y glúteos, 25 min',
  'Lumbares y core, 20 min',
  'Pecho y hombros, 35 min',
  'Bíceps y tríceps, 20 min',
  'Full body, foco glúteos, 30 min',
  'Full body, foco espalda, 35 min',
  'Cuerpo completo suave, 20 min',
  'Trapecio y hombros, 25 min',
  'Antebrazos y bíceps, 20 min',
  'Glúteos y core, 30 min',
  'Piernas y glúteos, 40 min',
  'Espalda y hombros, 30 min',
  'Abdominales intenso, 25 min',
  'Tren inferior suave, 25 min',
  'Pecho y espalda, 40 min',
  'Brazos intenso, 30 min',
  'Cuádriceps, 20 min',
  'Hombros suave, 30 min',
  'Core, 35 min',
  'Full body, foco piernas, 40 min',
] as const;

/** `n` different suggestions at random (`rng` returns 0..1). */
export function pickSuggestions(n: number, rng: () => number = Math.random): string[] {
  const pool: string[] = [...SUGGESTIONS];
  const picked: string[] = [];
  while (picked.length < n && pool.length > 0) {
    picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return picked;
}
