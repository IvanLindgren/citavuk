import { request } from './client';
import { utf8ByteOffset } from './translate';

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

/**
 * Возвратная частица «se», относящаяся к разобранному глаголу.
 *
 * В сербском «se» почти никогда не стоит вплотную к глаголу: у неё нет своего
 * ударения, и место ей отводит фраза — второе в предложении. «On se zove
 * Marko» выглядит так, будто частица при «on», а на деле это глагол «zvati se».
 */
export interface ReflexiveParticle {
  /** Частица как она написана в тексте: «se» или «се». */
  particle: string;
  /** Словоформа глагола, к которому частица относится. */
  verb: string;
  /** Нажали на саму частицу, а не на глагол. */
  onParticle: boolean;
  /** Второе слово пары — то, что нужно подсветить вдобавок к нажатому. */
  companion: string;
  /** Спутник стоит перед нажатым словом — по этому признаку его ищут в абзаце. */
  before: boolean;
  /** Между частицей и глаголом нет других слов. */
  adjacent: boolean;
  /** Словарный порядок: «zove se», как бы ни стояло в тексте. */
  phrase: string;
  /** Начальная форма вместе с частицей: «zvati se». */
  lemma?: string;
  /** Чем «se» бывает при глаголе. */
  meaning: string;
  /** Почему частица оказалась именно на этом месте. */
  why: string;
}

/**
 * Ударение из словаря.
 *
 * По написанию место ударения в сербском не восстанавливается: ударений четыре
 * (краткое и долгое, восходящее и нисходящее). Данные — из Викисловаря, поэтому
 * `source` обязателен: этого требует лицензия CC BY-SA.
 */
export interface WordAccent {
  /** Ударное написание самой словоформы: «knjȉga». */
  written?: string;
  /** Транскрипция с тоном: «/kɲîɡa/». */
  ipa?: string;
  /** Ударение относится к начальной форме, а не к слову из текста. */
  ofLemma?: boolean;
  /** Та самая начальная форма, ударная. */
  lemma?: string;
  source: string;
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
  /** Заполнено, если при глаголе во фразе стоит частица «se». */
  reflexive?: ReflexiveParticle;
  /** Ударение из словаря. Пусто, если слова в нём нет. */
  accent?: WordAccent;
  /** Заполнено, если слово опознано английским. */
  english?: EnglishAnalysis;
  /**
   * Начальную форму подсказала нейросеть: в словаре форм этого слова нет.
   *
   * Падежи, числа и таблицы всё равно посчитал грамматический движок — и только
   * после того, как парадигма от подсказки дала ровно эту форму. Но сказать об
   * этом читателю надо: словарной статьи за таким разбором не стоит.
   */
  generated?: boolean;
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
 *
 * [start] и [end] — границы слова во фразе. По ним сервер находит возвратную
 * частицу «se»: без смещений он берёт первое вхождение слова, а во фразе с
 * повтором это может оказаться другое место.
 */
export function analyzeWord(
  word: string,
  signal?: AbortSignal,
  sentence?: string,
  start?: number,
  end?: number,
): Promise<WordAnalysis> {
  const body: Record<string, unknown> = { word };
  if (sentence) {
    body.sentence = sentence;
    if (start !== undefined && end !== undefined) {
      body.start = utf8ByteOffset(sentence, start);
      body.end = utf8ByteOffset(sentence, end);
    }
  }
  return request<WordAnalysis>('/v1/analyze', {
    method: 'POST',
    body,
    anonymous: true,
    signal,
  });
}

/** Один из возможных разборов слова во фразе. */
export interface SentenceToken {
  index: number;
  surface: string;
  /** Границы слова в БАЙТАХ внутри фразы — так их считает сервер. */
  start: number;
  end: number;
  lemma: string;
  upos: string;
  posShort: string;
  feats: Record<string, string>;
  known: boolean;
  translation?: string;
  /** Разбор выбран по соседям, а не как самый вероятный. */
  chosenByContext: boolean;
}

/** Связанная группа слов: предложная, глагольная или именная. */
export interface SentenceChunk {
  kind: 'prep' | 'verb' | 'noun';
  head: number;
  tokens: number[];
  text: string;
  case?: string;
  caseName?: string;
  label: string;
  note?: string;
}

export interface SentenceAnalysis {
  sentence: string;
  tokens: SentenceToken[];
  chunks: SentenceChunk[];
}

/**
 * Разбирает фразу целиком.
 *
 * Разбор по слову отвечает «что это за форма», но сербская форма сама по себе
 * почти всегда неоднозначна: «kući» — и дательный, и местный. Что именно перед
 * нами, решает соседство: предлог задаёт падеж, вспомогательный глагол вместе с
 * причастием даёт время. Увидеть это соседство учащемуся больше негде.
 */
export function analyzeSentence(
  sentence: string,
  signal?: AbortSignal,
): Promise<SentenceAnalysis> {
  return request<SentenceAnalysis>('/v1/analyze/sentence', {
    method: 'POST',
    body: { sentence },
    anonymous: true,
    signal,
  });
}
