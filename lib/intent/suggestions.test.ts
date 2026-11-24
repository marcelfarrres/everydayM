import { describe, expect, it } from 'vitest';
import { parseIntentKeywords } from './keywords';
import { SUGGESTIONS, pickSuggestions } from './suggestions';

const FULL_BODY = /full body|cuerpo completo/i;

describe('the suggestions of the routine creator', () => {
  it('has about fifty different sentences', () => {
    expect(SUGGESTIONS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(SUGGESTIONS).size).toBe(SUGGESTIONS.length);
  });

  it.each(SUGGESTIONS)('the local parser understands «%s»', (sentence) => {
    const intent = parseIntentKeywords(sentence);
    expect(intent.muscles.length).toBeGreaterThan(0);
    expect(intent.muscles.some((m) => m.role === 'primary')).toBe(true);
    // the length it says, within what the creator allows
    const minutes = Number(/(\d+) min/.exec(sentence)?.[1]);
    expect(intent.targetMinutes).toBe(minutes);
    expect(minutes).toBeGreaterThanOrEqual(20);
    expect(minutes).toBeLessThanOrEqual(40);
    // muscles it really read: not the default full body unless it asks for full body
    if (!FULL_BODY.test(sentence)) expect(intent.focusLabel).not.toBe('Full body');
  });

  it('picks different ones at random', () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const three = pickSuggestions(3, rng);
    expect(three).toHaveLength(3);
    expect(new Set(three).size).toBe(3);
    three.forEach((s) => expect(SUGGESTIONS).toContain(s));
  });
});
