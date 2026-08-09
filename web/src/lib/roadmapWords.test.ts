import { describe, expect, it } from 'vitest';

import { roadmapWordExample } from './roadmapWords';

describe('roadmapWordExample', () => {
  it('prefers the curated database example', () => {
    expect(roadmapWordExample({
      lemma: 'kuća',
      pos: 'NOUN',
      note: 'ж',
      example: 'Moja kuća je blizu škole.',
    })).toBe('Moja kuća je blizu škole.');
  });

  it('builds grammatical fallbacks for nouns and reflexive verbs', () => {
    expect(roadmapWordExample({ lemma: 'vrata', pos: 'NOUN', note: 'мн.' }))
      .toBe('Ovo su vrata.');
    expect(roadmapWordExample({ lemma: 'odmoriti se', pos: 'VERB' }))
      .toBe('Sutra ću se odmoriti.');
  });
});

