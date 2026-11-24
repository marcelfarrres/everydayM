import { describe, expect, it } from 'vitest';
import { validateKeywordExamples } from './keywords.examples';
import { parseRounds, sanitizeRoutineIntent } from './keywords';

describe('keyword parser', () => {
  it('parses every documented example', () => {
    const { failures } = validateKeywordExamples();
    expect(failures).toEqual([]);
  });

  it('reads blocks with any of their names', () => {
    expect(parseRounds('3 bloques')).toBe(3);
    expect(parseRounds('Tres rondas de glúteo')).toBe(3);
    expect(parseRounds('cuatro vueltas')).toBe(4);
    expect(parseRounds('glúteo 30 minutos')).toBeNull();
  });
});

describe('sanitizeRoutineIntent (Gemini output)', () => {
  const base = {
    muscles: [{ id: 'gluteos', role: 'primary', weight: 1 }],
    difficulty: 5,
    targetMinutes: 30,
    slotSeconds: null,
    includeWarmup: true,
    focusLabel: 'Glúteos',
  };

  it('keeps explicit blocks, series and variation from the model', () => {
    const intent = sanitizeRoutineIntent({ ...base, rounds: 4, exercisesPerRound: 3, variation: 'all' }, 'glúteo');
    expect(intent.rounds).toBe(4);
    expect(intent.exercisesPerRound).toBe(3);
    expect(intent.variation).toBe('all');
  });

  it('falls back to the sentence when the model leaves them null', () => {
    const intent = sanitizeRoutineIntent(
      { ...base, rounds: null, exercisesPerRound: null, variation: null },
      'glúteo 3 bloques de 5 series, siempre lo mismo',
    );
    expect(intent.rounds).toBe(3);
    expect(intent.exercisesPerRound).toBe(5);
    expect(intent.variation).toBe('same');
  });

  it('ignores nonsense values', () => {
    const intent = sanitizeRoutineIntent({ ...base, rounds: -2, exercisesPerRound: 'x', variation: 'mucho' }, 'glúteo');
    expect(intent.rounds).toBeNull();
    expect(intent.exercisesPerRound).toBeNull();
    expect(intent.variation).toBeUndefined();
  });
});
