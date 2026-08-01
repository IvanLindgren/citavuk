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

/** Как английское слово соотносится со своей начальной формой. */
export type EnglishFormKind = 'lemma' | 'regular' | 'irregular';

export interface EnglishAnalysis {
  surface: string;
  lemma: string;
  upos: string;
  posFull: string;
  posShort: string;
  formKind: EnglishFormKind;
  facts: GrammarFact[];
  /** Короткое имя формы для словаря: «мн. ч.», «прош. вр.». */
  formLabel?: string;
  why?: string;
  /** Слово бывает и самостоятельным: «saw» — и «пила», и прошедшее от «see». */
  alsoLemma?: boolean;
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
  /** Заполнено, если слово опознано английским. */
  english?: EnglishAnalysis;
}

/**
 * Грамматический разбор словоформы.
 *
 * Приложение разбирает слово офлайн по своей копии лексикона; в браузере такой
 * копии нет, поэтому тот же словарь живёт на сервере.
 *
 * [sentence] нужно серверу, чтобы выбрать язык: «on», «to», «most» —
 * одновременно сербские и английские слова, и в отрыве от фразы они
 * неразличимы в принципе.
 */
export function analyzeWord(
  word: string,
  signal?: AbortSignal,
  sentence?: string,
): Promise<WordAnalysis> {
  return request<WordAnalysis>('/v1/analyze', {
    method: 'POST',
    body: sentence ? { word, sentence } : { word },
    anonymous: true,
    signal,
  });
}
