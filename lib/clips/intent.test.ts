import { describe, expect, it } from 'vitest';
import { clipTypeInComment, matchExerciseTitle, musclesIn, parseClipIntentKeywords } from './intent';

const TITLES = ['Sentadilla búlgara', 'Puente de glúteo', 'Flexiones diamante', 'Hip thrust', 'Plancha'];

describe('parseClipIntentKeywords', () => {
  it('reads the example sentence from the plan as a talk about glutes', () => {
    const intent = parseClipIntentKeywords('hazme un clip de un ejercicio de glúteo donde salgo explicando', TITLES);
    expect(intent.type).toBe('talk');
    expect(intent.needsTalk).toBe(true);
    expect(intent.muscles).toEqual(['gluteos']);
    expect(intent.exercise).toBeNull();
  });

  it('finds intro + talk, a named exercise and its plural', () => {
    const intent = parseClipIntentKeywords('la intro y luego explico las sentadillas búlgaras', TITLES);
    expect(intent.type).toBe('intro_talk');
    expect(intent.exercise).toBe('Sentadilla búlgara');
  });

  it('reads the full routine with minutes, and does not take "cuerpo completo" for it', () => {
    expect(parseClipIntentKeywords('rutina completa de piernas de 25 minutos')).toMatchObject({ type: 'full', minutes: 25 });
    expect(parseClipIntentKeywords('mezcla de cuerpo completo').type).toBe('random_mix');
  });

  it('defaults to a random mix and recognises the other types', () => {
    expect(parseClipIntentKeywords('algo de hombro').type).toBe('random_mix');
    expect(parseClipIntentKeywords('un reto de abdominales').type).toBe('challenge');
    expect(parseClipIntentKeywords('top 3 de pecho').type).toBe('top3');
    expect(parseClipIntentKeywords('un carrusel de fotos de espalda').type).toBe('carousel');
    expect(parseClipIntentKeywords('un resumen de brazos').type).toBe('summary');
  });
});

describe('clipTypeInComment', () => {
  it('only switches type when the comment asks for one', () => {
    expect(clipTypeInComment('la música tapa la voz, prueba otra')).toBeNull();
    expect(clipTypeInComment('mejor un reto')).toBe('challenge');
    expect(clipTypeInComment('mejor un vídeo hablado')).toBe('talk');
    expect(clipTypeInComment('cualquiera menos este')).toBeNull();
  });
});

describe('musclesIn', () => {
  it('expands groups and keeps order of mention', () => {
    expect(musclesIn('brazos y hombros')).toEqual(['biceps', 'triceps', 'antebrazos', 'hombros']);
    expect(musclesIn('antebrazo')).toEqual(['antebrazos']);
    expect(musclesIn('nada en concreto')).toEqual([]);
  });
});

describe('matchExerciseTitle', () => {
  it('does not take a muscle word for an exercise', () => {
    expect(matchExerciseTitle('un ejercicio de glúteo', TITLES)).toBeNull();
    expect(matchExerciseTitle('hip thrust explicado', TITLES)).toBe('Hip thrust');
  });
});
