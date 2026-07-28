import { request } from './client';

export interface GrammarFact {
  label: string;
  value: string;
}

export interface ParadigmCell {
  label: string;
  form: string;
  /** Форма, по которой нажал пользователь. */
  current?: boolean;
  /** Достроена правилом, а не взята из словаря. */
  generated?: boolean;
  caseKey?: string;
}

export interface ParadigmTable {
  title: string;
  subtitle?: string;
  rows: ParadigmCell[];
  highlightEndings?: boolean;
}

export interface PrepositionGovernment {
  caseKey: string;
  caseName: string;
  meaning: string;
}

export interface WordAnalysis {
  surface: string;
  lemma: string;
  upos: string;
  posFull: string;
  posShort: string;
  feats: Record<string, string>;
  /** Слово нашлось в словаре форм. */
  known: boolean;
  /** Словарное значение начальной формы. */
  translation?: string;
  facts: GrammarFact[];
  summary: string;
  why: string;
  paradigms: ParadigmTable[];
  prepositions?: PrepositionGovernment[];
}

/**
 * Грамматический разбор словоформы.
 *
 * Приложение разбирает слово офлайн по своей копии лексикона; в браузере такой
 * копии нет, поэтому тот же словарь живёт на сервере.
 */
export function analyzeWord(
  word: string,
  signal?: AbortSignal,
): Promise<WordAnalysis> {
  return request<WordAnalysis>('/v1/analyze', {
    method: 'POST',
    body: { word },
    anonymous: true,
    signal,
  });
}
