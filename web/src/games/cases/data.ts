/**
 * Логика игры «Уничтожь эти падежи с Читавуком!» без интерфейса.
 *
 * Правила продублированы во Flutter (lib/games/cases/case_game_data.dart) и
 * обязаны совпадать: одинаковые задания, одинаковая проверка ответа.
 */

export type NumberKey = 's' | 'p';
export type CaseKey = 'n' | 'g' | 'd' | 'a' | 'v' | 'i' | 'l';
export type TenseKey = 'pres' | 'perf' | 'fut' | 'imp';

export interface NounEntry {
  l: string;
  t: string;
  lv: string;
  g: 'm' | 'f' | 'n';
  f: Partial<Record<`${NumberKey}${CaseKey}`, string[]>>;
}

export interface PronounEntry {
  l: string;
  t: string;
  f: Partial<Record<CaseKey, string[]>>;
}

type Persons = '1s' | '2s' | '3s' | '1p' | '2p' | '3p';

export interface VerbEntry {
  l: string;
  t: string;
  lv: string;
  pr: Record<Persons, string[]>;
  pp: Record<'sm' | 'sf' | 'sn' | 'pm' | 'pf' | 'pn', string[]>;
  im?: Record<'2s' | '1p' | '2p', string[]>;
  fu?: Record<Persons, string[]>;
}

export interface CaseGameData {
  version: number;
  nouns: NounEntry[];
  pronouns: PronounEntry[];
  verbs: VerbEntry[];
}

export interface Task {
  kind: 'noun' | 'pronoun' | 'verb';
  lemma: string;
  translation: string;
  /** Что сделать, по-русски: «Родительный · мн. ч.». */
  label: string;
  /** То же по-сербски — так падеж называют в учебниках. */
  labelSr: string;
  /** Фраза-рамка: «bez ___». Ответ вписывается на место пропуска. */
  before: string;
  after: string;
  /** Верные ответы, эталон первым. */
  answers: string[];
  /** Ключ слабого места для итогов. */
  weakKey: string;
  weakLabel: string;
}

export const CASES: { key: CaseKey; sr: string; ru: string }[] = [
  { key: 'n', sr: 'nominativ', ru: 'Именительный' },
  { key: 'g', sr: 'genitiv', ru: 'Родительный' },
  { key: 'd', sr: 'dativ', ru: 'Дательный' },
  { key: 'a', sr: 'akuzativ', ru: 'Винительный' },
  { key: 'v', sr: 'vokativ', ru: 'Звательный' },
  { key: 'i', sr: 'instrumental', ru: 'Творительный' },
  { key: 'l', sr: 'lokativ', ru: 'Местный' },
];

export const TENSES: { key: TenseKey; sr: string; ru: string }[] = [
  { key: 'pres', sr: 'prezent', ru: 'Настоящее' },
  { key: 'perf', sr: 'perfekat', ru: 'Прошедшее' },
  { key: 'fut', sr: 'futur I', ru: 'Будущее' },
  { key: 'imp', sr: 'imperativ', ru: 'Повелительное' },
];

/** Наборы заданий; идентификатор уходит на сервер в поле scope. */
export type Scope =
  | 'all'
  | 'nouns'
  | 'pronouns'
  | `case:${CaseKey}`
  | 'verbs'
  | `tense:${TenseKey}`;

export type WordLevel = 'a' | 'b' | 'all';

const LEVELS: Record<WordLevel, string[]> = {
  a: ['A1', 'A2'],
  b: ['A1', 'A2', 'B1', 'B2'],
  all: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
};

/** Рамки: падеж виден по предлогу или глаголу рядом, как в живой речи. */
const NOUN_FRAMES: Record<CaseKey, [string, string]> = {
  n: ['Ovo su', ''],
  g: ['bez', ''],
  d: ['prema', ''],
  a: ['Vidim', ''],
  v: ['Zdravo,', '!'],
  i: ['sa', ''],
  l: ['o', ''],
};

const PRONOUN_FRAMES: Record<CaseKey, [string, string]> = {
  n: ['', ''],
  g: ['bez', ''],
  d: ['Daj', 'knjigu.'],
  a: ['Vidim', ''],
  v: ['', ''],
  i: ['sa', ''],
  l: ['o', ''],
};

/** Краткие формы: после предлога они невозможны («bez me» — ошибка). */
const CLITICS = new Set(['me', 'te', 'ga', 'je', 'ju', 'mi', 'ti', 'mu', 'joj', 'nam', 'vam', 'im', 'ih', 'se', 'si']);
const PREPOSITION_CASES = new Set<CaseKey>(['g', 'i', 'l']);

const PERSONS: { key: Persons; pronoun: string; ru: string }[] = [
  { key: '1s', pronoun: 'ja', ru: '1-е л. ед.' },
  { key: '2s', pronoun: 'ti', ru: '2-е л. ед.' },
  { key: '3s', pronoun: 'on', ru: '3-е л. ед.' },
  { key: '1p', pronoun: 'mi', ru: '1-е л. мн.' },
  { key: '2p', pronoun: 'vi', ru: '2-е л. мн.' },
  { key: '3p', pronoun: 'oni', ru: '3-е л. мн.' },
];

const AUX_PERFECT: Record<Persons, string> = { '1s': 'sam', '2s': 'si', '3s': 'je', '1p': 'smo', '2p': 'ste', '3p': 'su' };
const AUX_FUTURE: Record<Persons, string> = { '1s': 'ću', '2s': 'ćeš', '3s': 'će', '1p': 'ćemo', '2p': 'ćete', '3p': 'će' };

export type Random = () => number;

function pickOne<T>(items: T[], random: Random): T {
  return items[Math.floor(random() * items.length)]!;
}

function numberLabel(number: NumberKey) {
  return number === 's' ? 'ед. ч.' : 'мн. ч.';
}

function numberLabelSr(number: NumberKey) {
  return number === 's' ? 'jednina' : 'množina';
}

function caseInfo(key: CaseKey) {
  return CASES.find((item) => item.key === key)!;
}

function nounTask(noun: NounEntry, cell: `${NumberKey}${CaseKey}`): Task | null {
  const answers = noun.f[cell];
  if (!answers?.length) return null;
  const number = cell[0] as NumberKey;
  const key = cell[1] as CaseKey;
  const info = caseInfo(key);
  const [before, after] = NOUN_FRAMES[key];
  return {
    kind: 'noun',
    lemma: noun.l,
    translation: noun.t,
    label: `${info.ru} · ${numberLabel(number)}`,
    labelSr: `${info.sr} · ${numberLabelSr(number)}`,
    before,
    after,
    answers,
    weakKey: `noun:${cell}`,
    weakLabel: `${info.ru}, ${numberLabel(number)}`,
  };
}

function pronounTask(pronoun: PronounEntry, key: CaseKey): Task | null {
  let answers = pronoun.f[key];
  if (!answers?.length) return null;
  if (PREPOSITION_CASES.has(key)) answers = answers.filter((form) => !CLITICS.has(form));
  if (!answers.length) return null;
  const info = caseInfo(key);
  const [before, after] = PRONOUN_FRAMES[key];
  return {
    kind: 'pronoun',
    lemma: pronoun.l,
    translation: pronoun.t,
    label: `${info.ru} · местоимение`,
    labelSr: info.sr,
    before,
    after,
    answers,
    weakKey: `pronoun:${key}`,
    weakLabel: `Местоимения: ${info.ru.toLowerCase()}`,
  };
}

function verbTask(verb: VerbEntry, tense: TenseKey, random: Random): Task | null {
  const info = TENSES.find((item) => item.key === tense)!;
  const base = {
    kind: 'verb' as const,
    lemma: verb.l,
    translation: verb.t,
    weakKey: `verb:${tense}`,
    weakLabel: `Глаголы: ${info.ru.toLowerCase()}`,
  };
  if (tense === 'imp') {
    if (!verb.im) return null;
    const person = pickOne(['2s', '1p', '2p'] as const, random);
    const who = person === '2s' ? 'ti' : person === '1p' ? 'mi' : 'vi';
    return {
      ...base,
      label: `${info.ru} · ${who}`,
      labelSr: `${info.sr} · ${who}`,
      before: `(${who})`,
      after: '!',
      answers: verb.im[person],
    };
  }
  const person = pickOne(PERSONS, random);
  if (tense === 'pres') {
    return {
      ...base,
      label: `${info.ru} · ${person.ru}`,
      labelSr: info.sr,
      before: person.pronoun,
      after: '',
      answers: verb.pr[person.key],
    };
  }
  if (tense === 'fut') {
    const analytic = `${AUX_FUTURE[person.key]} ${verb.l}`;
    // С подлежащим клитика идёт второй: «ja ću raditi». Слитное «radiću»
    // тоже верно, если у глагола оно есть.
    const answers = [analytic, ...(verb.fu?.[person.key] ?? [])];
    return {
      ...base,
      label: `${info.ru} · ${person.ru}`,
      labelSr: info.sr,
      before: person.pronoun,
      after: '',
      answers,
    };
  }
  // Перфект: род причастия зависит от подлежащего.
  const plural = person.key.endsWith('p');
  let gender: 'm' | 'f' | 'n' = random() < 0.5 ? 'm' : 'f';
  let pronoun = person.pronoun;
  if (person.key === '3s') {
    gender = pickOne(['m', 'f', 'n'] as const, random);
    pronoun = gender === 'm' ? 'on' : gender === 'f' ? 'ona' : 'ono';
  } else if (person.key === '3p') {
    gender = pickOne(['m', 'f', 'n'] as const, random);
    pronoun = gender === 'm' ? 'oni' : gender === 'f' ? 'one' : 'ona';
  } else if (plural) {
    gender = 'm';
  }
  const participles = verb.pp[`${plural ? 'p' : 's'}${gender}` as keyof VerbEntry['pp']];
  const aux = AUX_PERFECT[person.key];
  const genderRu = gender === 'm' ? 'муж.' : gender === 'f' ? 'жен.' : 'ср.';
  const answers = [
    ...participles.map((participle) => `${aux} ${participle}`),
    ...participles.map((participle) => `${participle} ${aux}`),
  ];
  // «mi smo radili» — общий род; женский тоже верен, если все — женщины.
  if (plural && person.key !== '3p') {
    for (const participle of verb.pp.pf) answers.push(`${aux} ${participle}`, `${participle} ${aux}`);
  }
  const showGender = person.key === '1s' || person.key === '2s';
  return {
    ...base,
    label: `${info.ru} · ${person.ru}${showGender ? `, ${genderRu} род` : ''}`,
    labelSr: info.sr,
    before: showGender ? `${pronoun} (${gender === 'm' ? 'm' : 'ž'})` : pronoun,
    after: '',
    answers,
  };
}

/** Источник заданий набора: каждый вызов next() даёт новое задание. */
export function taskSource(data: CaseGameData, scope: Scope, level: WordLevel, random: Random = Math.random) {
  const allowed = new Set(LEVELS[level]);
  const nouns = data.nouns.filter((noun) => allowed.has(noun.lv));
  const verbs = data.verbs.filter((verb) => allowed.has(verb.lv));
  const obliqueCases: CaseKey[] = ['n', 'g', 'd', 'a', 'v', 'i', 'l'];

  const nounCells = (keys: CaseKey[]) => {
    const cells: `${NumberKey}${CaseKey}`[] = [];
    for (const key of keys) {
      // Именительный единственного — это само словарное слово, тренировать нечего.
      if (key !== 'n') cells.push(`s${key}`);
      cells.push(`p${key}`);
    }
    return cells;
  };

  const makers: (() => Task | null)[] = [];
  const wantNouns = scope === 'all' || scope === 'nouns' || scope.startsWith('case:');
  const wantPronouns = scope === 'all' || scope === 'pronouns' || scope.startsWith('case:');
  const caseFilter: CaseKey[] = scope.startsWith('case:') ? [scope.slice(5) as CaseKey] : obliqueCases;

  if (wantNouns && nouns.length) {
    const cells = nounCells(caseFilter);
    makers.push(() => {
      const cell = pickOne(cells, random);
      const withCell = cell[1] === 'v' ? nouns.filter((noun) => noun.f.sv) : nouns;
      return withCell.length ? nounTask(pickOne(withCell, random), cell) : null;
    });
  }
  const pronounCases = caseFilter.filter((key) => key !== 'n' && key !== 'v');
  if (wantPronouns && pronounCases.length) {
    // Местоимений мало, поэтому в общем наборе они выпадают реже.
    const weight = scope === 'pronouns' ? 1 : 0.35;
    makers.push(() => (random() < weight
      ? pronounTask(pickOne(data.pronouns, random), pickOne(pronounCases, random))
      : null));
  }
  const tenses: TenseKey[] = scope === 'verbs' ? ['pres', 'perf', 'fut', 'imp'] : scope.startsWith('tense:') ? [scope.slice(6) as TenseKey] : [];
  if (tenses.length && verbs.length) {
    makers.push(() => verbTask(pickOne(verbs, random), pickOne(tenses, random), random));
  }
  if (!makers.length) throw new Error(`пустой набор: ${scope}`);

  let previous = '';
  return {
    next(): Task {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const task = pickOne(makers, random)();
        // Одно и то же слово подряд выглядит как зависание.
        if (task && `${task.lemma}:${task.label}` !== previous) {
          previous = `${task.lemma}:${task.label}`;
          return task;
        }
      }
      throw new Error('не удалось составить задание');
    },
  };
}

// --- Проверка ответа ---

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j', к: 'k',
  л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

export const DIACRITIC_BASE: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'd' };

/** Сербская кириллица → латиница; регистр, пробелы и знаки по краям убираются. */
export function normalizeAnswer(value: string): string {
  const lower = value.toLocaleLowerCase('sr');
  let out = '';
  for (const ch of lower) out += CYRILLIC[ch] ?? ch;
  return out.replace(/[.,!?;:]+$/g, '').replace(/\s+/g, ' ').trim();
}

function fold(value: string, dj: boolean): string {
  let out = '';
  for (const ch of value) {
    if (ch === 'đ') out += dj ? 'dj' : 'd';
    else out += DIACRITIC_BASE[ch] ?? ch;
  }
  return out;
}

/** Хвост фразы после ответа: знак препинания вплотную, слово — через пробел. */
export function frameTail(after: string): string {
  if (!after) return '';
  return /^[!.?,]/.test(after) ? after : ` ${after}`;
}

/** Фраза целиком с ответом на месте пропуска: «bez kuće». */
export function framed(task: Pick<Task, 'before' | 'after'>, answer: string): string {
  return `${task.before ? `${task.before} ` : ''}${answer}${frameTail(task.after)}`;
}

export interface Verdict {
  result: 'exact' | 'diacritics' | 'wrong';
  /** С каким верным вариантом совпало. */
  matched: string;
  /** Буквы с чёрточками, которых не хватило: ['č']. */
  missing: string[];
}

/**
 * Сравнивает ответ с верными вариантами. Буква без чёрточки вместо буквы с
 * чёрточкой засчитывается, но отмечается: «здесь нужна č». «dj» вместо «đ» —
 * общепринятая замена и тоже засчитывается с отметкой.
 */
export function checkAnswer(typed: string, answers: string[]): Verdict {
  const value = normalizeAnswer(typed);
  for (const answer of answers) {
    if (value === normalizeAnswer(answer)) return { result: 'exact', matched: answer, missing: [] };
  }
  for (const answer of answers) {
    const expected = normalizeAnswer(answer);
    if (fold(value, true) === fold(expected, true) || fold(value, false) === fold(expected, false)) {
      const missing = [...new Set([...expected].filter((ch) => ch in DIACRITIC_BASE && !value.includes(ch)))];
      // Лишняя чёрточка там, где её нет, — тоже ошибка написания.
      return { result: missing.length ? 'diacritics' : 'wrong', matched: answer, missing };
    }
  }
  return { result: 'wrong', matched: answers[0] ?? '', missing: [] };
}

// --- Итоги партии ---

export interface Attempt {
  task: Task;
  typed: string;
  verdict: Verdict;
  ms: number;
}

export interface Summary {
  words: number;
  correct: number;
  wrong: number;
  diacriticSlips: number;
  chars: number;
  cpm: number;
  wpm: number;
  accuracy: number;
  weak: { label: string; wrong: number; total: number }[];
}

export function summarize(attempts: Attempt[], elapsedSeconds: number): Summary {
  const words = attempts.length;
  const correctAttempts = attempts.filter((item) => item.verdict.result !== 'wrong');
  const correct = correctAttempts.length;
  const diacriticSlips = attempts.filter((item) => item.verdict.result === 'diacritics').length;
  const chars = correctAttempts.reduce((sum, item) => sum + normalizeAnswer(item.typed).length, 0);
  const minutes = Math.max(elapsedSeconds, 1) / 60;
  const groups = new Map<string, { label: string; wrong: number; total: number }>();
  for (const item of attempts) {
    const group = groups.get(item.task.weakKey) ?? { label: item.task.weakLabel, wrong: 0, total: 0 };
    group.total += 1;
    if (item.verdict.result === 'wrong') group.wrong += 1;
    groups.set(item.task.weakKey, group);
  }
  const weak = [...groups.values()]
    .filter((group) => group.wrong > 0)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong)
    .slice(0, 5);
  return {
    words,
    correct,
    wrong: words - correct,
    diacriticSlips,
    chars,
    cpm: Math.round(chars / minutes),
    wpm: Math.round((correct / minutes) * 10) / 10,
    accuracy: words ? Math.round((correct / words) * 1000) / 10 : 0,
    weak,
  };
}

export function scopeTitle(scope: Scope): string {
  if (scope === 'all') return 'Все падежи';
  if (scope === 'nouns') return 'Падежи существительных';
  if (scope === 'pronouns') return 'Падежи местоимений';
  if (scope === 'verbs') return 'Все времена глаголов';
  if (scope.startsWith('case:')) return caseInfo(scope.slice(5) as CaseKey).ru;
  const tense = TENSES.find((item) => item.key === scope.slice(6));
  return tense ? tense.ru : scope;
}
