import type { RoadmapWord } from '../api/roadmap';

/**
 * Context for old cached API responses and newly added words.
 *
 * Production words receive an editable example from the database. The local
 * fallback keeps a staggered server/web rollout from ever showing a bare word.
 */
export function roadmapWordExample(
  word: Pick<RoadmapWord, 'lemma' | 'pos' | 'note' | 'example'>,
): string {
  const stored = word.example?.trim();
  if (stored) return stored;

  const lemma = word.lemma.trim();
  switch (word.pos?.trim().toUpperCase()) {
    case 'NOUN':
      return word.note?.trim().toLocaleLowerCase('ru') === 'мн.'
        ? `Ovo su ${lemma}.`
        : `Ovo je ${lemma}.`;
    case 'VERB': {
      const reflexive = lemma.match(/^(.*)\s+se$/iu);
      return reflexive ? `Sutra ću se ${reflexive[1]}.` : `Sutra ću ${lemma}.`;
    }
    case 'ADJ':
      return `Ovo je ${lemma} primer.`;
    case 'ADV':
      return `U ovoj rečenici koristim prilog „${lemma}“.`;
    case 'NUM':
      return `Na kartici piše broj ${lemma}.`;
    case 'INTJ':
      return `Kažem „${lemma}“ u razgovoru.`;
    default:
      return `U ovoj rečenici koristim reč „${lemma}“.`;
  }
}

