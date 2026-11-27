import { describe, expect, it } from 'vitest';
import { creatorJoke, type CreatorSend } from './creatorJoke';

const phone = { fired: false, phone: true };
const joke = (send: CreatorSend) => creatorJoke(send, phone);
const sentence = (prompt: string) => joke({ kind: 'sentence', prompt });

describe('creator jokes', () => {
  it('teases minutes under 25, and accepts 25 or more', () => {
    expect(joke({ kind: 'minutes', minutes: 20 })).toBe('time');
    expect(joke({ kind: 'minutes', minutes: 24 })).toBe('time');
    // any whole minute (the tank sets 21, 22, 23… too)
    for (const m of [21, 22, 23]) expect(joke({ kind: 'minutes', minutes: m })).toBe('time');
    for (const m of [26, 31, 33, 39]) expect(joke({ kind: 'minutes', minutes: m })).toBeNull();
    expect(joke({ kind: 'minutes', minutes: 25 })).toBeNull();
    expect(joke({ kind: 'minutes', minutes: 30 })).toBeNull();
    expect(joke({ kind: 'minutes', minutes: 40 })).toBeNull();
  });

  it('teases Suave only, and accepts Media and Alta', () => {
    expect(joke({ kind: 'intensity', difficulty: 4 })).toBe('intensity');
    expect(joke({ kind: 'intensity', difficulty: 6 })).toBeNull();
    expect(joke({ kind: 'intensity', difficulty: 8 })).toBeNull();
  });

  it('fires once per creation: after a joke, everything goes through (even the same 20)', () => {
    const fired = { fired: true, phone: true };
    expect(creatorJoke({ kind: 'minutes', minutes: 20 }, fired)).toBeNull();
    expect(creatorJoke({ kind: 'intensity', difficulty: 4 }, fired)).toBeNull();
    expect(creatorJoke({ kind: 'sentence', prompt: 'Hombros, 20 minutos' }, fired)).toBeNull();
  });

  it('never fires on a computer', () => {
    const desktop = { fired: false, phone: false };
    expect(creatorJoke({ kind: 'minutes', minutes: 20 }, desktop)).toBeNull();
    expect(creatorJoke({ kind: 'intensity', difficulty: 4 }, desktop)).toBeNull();
    expect(creatorJoke({ kind: 'sentence', prompt: 'Piernas suave, 20 minutos' }, desktop)).toBeNull();
  });

  it('reads the time from a written sentence first', () => {
    expect(sentence('Hombros, 20 minutos')).toBe('time');
    expect(sentence('un cuarto de hora de core')).toBe('time');
    expect(sentence('Full body intenso, 20 minutos')).toBe('time');
    // 25 is enough time: then the soft intensity
    expect(sentence('Piernas suave, 25 minutos')).toBe('intensity');
  });

  it('then a soft intensity, when the time is enough or not said', () => {
    expect(sentence('Piernas suave')).toBe('intensity');
    expect(sentence('Pecho tranquilo, 40 minutos')).toBe('intensity');
    expect(sentence('Brazos nivel 3')).toBe('intensity');
  });

  it('lets a medium intensity through', () => {
    expect(sentence('Espalda a intensidad media')).toBeNull();
    expect(sentence('Hombros, 25 minutos')).toBeNull();
  });

  it('fires nothing for a sentence that says nothing weak (the questions come later)', () => {
    expect(sentence('Hombros')).toBeNull();
    expect(sentence('Full body, 30 minutos')).toBeNull();
    expect(sentence('Piernas intenso, 40 minutos')).toBeNull();
    expect(sentence('Pierna a tope')).toBeNull();
    // "media hora" is 30 minutes, not a medium intensity; "reventar" is all-out
    expect(sentence('Piernas, media hora')).toBeNull();
    expect(sentence('Quiero reventar los hombros')).toBeNull();
  });
});
