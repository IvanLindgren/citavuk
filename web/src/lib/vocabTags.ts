import { toLatin } from './tokenize';
import type { Review } from './vocabulary';
import { PLACE_NAMES, WORD_FREQ, WORD_PLACE, WORD_TOPICS } from './wordIndex';

/**
 * Метки записи словаря.
 *
 * Словарь копится из читалки и к сотне записей превращается в кучу: слово и
 * выделенная фраза лежат рядом, найти нужное нечем, а единственная группировка —
 * по книге, из которой слово взято. Метки дают второй разрез: по виду записи, по
 * части речи, по письму, по тому, как идёт запоминание, и по теме.
 *
 * Проставляются сами и нигде не хранятся. Метка — не поле записи, а взгляд на
 * неё: хранимая метка разошлась бы с состоянием повторения на следующий же день,
 * а перенос старых записей потребовал бы миграции ради подсказки.
 *
 * Тот же расчёт в приложении — frontend/lib/services/vocab_tags.dart. Совпадать
 * он обязан: словарь синхронизируется, и одна и та же запись на телефоне и в
 * браузере должна лежать под одной меткой.
 */

/** Разряд метки: по нему они раскладываются в отдельные ряды фильтра. */
export type TagKind =
  | 'kind'
  | 'pos'
  | 'script'
  | 'progress'
  | 'topic'
  | 'freq';

export interface Tag {
  id: string;
  kind: TagKind;
}

/** Подписи разрядов для заголовков рядов. */
export const TAG_KIND_TITLE: Record<TagKind, string> = {
  kind: 'Вид',
  pos: 'Часть речи',
  script: 'Письмо',
  progress: 'Как идёт',
  topic: 'Тема',
  freq: 'Насколько ходовое',
};

/**
 * Фраза ли это.
 *
 * По пробелу — им же отличает фразы `writable` в повторении письмом. Из книги в
 * словарь уходит выделенный кусок целиком, и таких записей у читающего человека
 * набирается едва ли не половина.
 */
export function isPhrase(word: string): boolean {
  return /\s/.test(word.trim());
}

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-zČĆĐŠŽčćđšž]/;

/**
 * Каким письмом записано.
 *
 * Сербский равноправно пишется кириллицей и латиницей, и в словарь одного
 * человека попадает и то и другое — из разных книг. Смешанные записи (латинское
 * название внутри сербской фразы) остаются без метки: спорную запись лучше не
 * относить никуда, чем отнести неверно.
 */
export function scriptOf(word: string): 'кириллица' | 'латиница' | null {
  const cyrillic = CYRILLIC.test(word);
  const latin = LATIN.test(word);
  if (cyrillic === latin) return null;
  return cyrillic ? 'кириллица' : 'латиница';
}

const POS_TAG: Record<string, string> = {
  NOUN: 'существительное',
  PROPN: 'имя собственное',
  ADJ: 'прилагательное',
  VERB: 'глагол',
  AUX: 'глагол',
  PRON: 'местоимение',
  DET: 'местоимение',
  ADV: 'наречие',
  NUM: 'числительное',
  ADP: 'предлог',
  CCONJ: 'союз',
  SCONJ: 'союз',
  PART: 'частица',
  INTJ: 'междометие',
};

/** Часть речи. `UNKNOWN` и `X` метки не дают: «слово» ничего не разделяет. */
export function posTag(pos: string): string | null {
  return POS_TAG[pos] ?? null;
}

/**
 * Как идёт запоминание.
 *
 * Считается по интервалу и лёгкости, а не по числу показов: три показа за один
 * день значат меньше одного удачного через месяц. «Трудное» — слово, на котором
 * лёгкость просела ниже начальной: именно к нему стоит вернуться отдельно, и
 * найти его иначе нельзя.
 */
export function progressTag(review: Review): string {
  if (review.reps === 0) return 'новое';
  if (review.intervalDays >= 30) return 'выучено';
  if (review.ease < 2.2) return 'трудное';
  return 'учу';
}

/** Ключ для указателя тем: латиница, нижний регистр, без хвостовых знаков. */
function topicKey(word: string): string {
  return toLatin(word.trim().toLowerCase()).replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
}

/**
 * Темы слова.
 *
 * Указатель собран из Путешествия — см. tools/build_word_index.py. У фраз тем
 * не бывает: указатель ведётся по словам, а искать в нём фразу целиком значит
 * не найти ничего.
 */
export function topicTags(word: string): string[] {
  if (isPhrase(word)) return [];
  return WORD_TOPICS[topicKey(word)] ?? [];
}

/**
 * Насколько ходовое слово.
 *
 * Считается по списку из двадцати тысяч лемм, по которому сервер оценивает
 * сложность книги; в клиент уезжает первая пятитысяча. Спрашивается сперва
 * начальная форма: указатель ведётся по леммам, и «кућама» в нём нет, а «кућа»
 * есть.
 *
 * Слова вне указателя метки НЕ получают. Отсутствие значит и «редкое», и
 * «начальную форму не распознали», а метка «редкое» на неразобранном слове —
 * это уверенное враньё вместо молчания.
 */
export function freqTag(word: string, lemma: string): string | null {
  const bucket =
    WORD_FREQ[topicKey(lemma)] ?? WORD_FREQ[topicKey(word)] ?? 0;
  if (bucket === 1) return 'первая тысяча';
  if (bucket === 2) return 'частое';
  return null;
}

export interface Place {
  id: string;
  sr: string;
  ru: string;
}

/**
 * Место из Путешествия, где слово встречается.
 *
 * Из всех мест берётся самое «узкое» — с наименьшим словником: слово из места с
 * пятнадцатью словами говорит о нём больше, чем из места с сорока. Нужно для
 * обратной ссылки: сохранённое слово перестаёт быть строкой в списке и ведёт
 * туда, где им пользуются.
 */
export function placeOf(word: string): Place | null {
  if (isPhrase(word)) return null;
  const id = WORD_PLACE[topicKey(word)];
  const name = id ? PLACE_NAMES[id] : undefined;
  return id && name ? { id, sr: name.sr, ru: name.ru } : null;
}

export interface Taggable {
  word: string;
  lemma: string;
  pos: string;
}

/** Все метки записи, в порядке разрядов. */
export function tagsFor(entry: Taggable, review: Review): Tag[] {
  const tags: Tag[] = [
    { id: isPhrase(entry.word) ? 'фраза' : 'слово', kind: 'kind' },
  ];

  // У фразы часть речи не спрашивается: разбор идёт по одному слову, и
  // сохранённая с ним часть речи описывала бы только первое.
  const pos = isPhrase(entry.word) ? null : posTag(entry.pos);
  if (pos) tags.push({ id: pos, kind: 'pos' });

  const script = scriptOf(entry.word);
  if (script) tags.push({ id: script, kind: 'script' });

  tags.push({ id: progressTag(review), kind: 'progress' });

  for (const topic of topicTags(entry.word)) {
    tags.push({ id: topic, kind: 'topic' });
  }

  // У фразы частотность не спрашивается по той же причине, что и часть речи:
  // указатель ведётся по одному слову.
  const freq = isPhrase(entry.word)
    ? null
    : freqTag(entry.word, entry.lemma);
  if (freq) tags.push({ id: freq, kind: 'freq' });

  return tags;
}

/** Порядок разрядов в ряду меток: сперва то, чем словарь делят чаще. */
const KIND_ORDER: TagKind[] = [
  'topic',
  'freq',
  'pos',
  'progress',
  'script',
  'kind',
];

/**
 * Метки с числами для ряда фильтра.
 *
 * Считать надо по тому, что осталось после поиска и выбранного вида, а не по
 * всему словарю: метка с числом, не совпадающим с длиной списка после нажатия
 * на неё, — обман. Вид записи в ряд не попадает: он уже разложен отдельными
 * кнопками выше.
 */
export function tagCounts(tagged: readonly Tag[][]): { tag: Tag; count: number }[] {
  const counts = new Map<string, { tag: Tag; count: number }>();
  for (const tags of tagged) {
    for (const tag of tags) {
      if (tag.kind === 'kind') continue;
      const found = counts.get(tag.id);
      if (found) found.count += 1;
      else counts.set(tag.id, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.tag.kind) - KIND_ORDER.indexOf(b.tag.kind) ||
      b.count - a.count ||
      a.tag.id.localeCompare(b.tag.id, 'ru'),
  );
}

/**
 * Подходит ли запись под строку поиска.
 *
 * Ищется и по сербскому слову, и по переводу, и по сохранённому контексту:
 * вспоминают запись по любому из трёх, а чаще всего — по русскому переводу.
 * Сравнение идёт в латинице, поэтому «kuća» находится и запросом «кућа».
 */
export function matchesQuery(
  fields: readonly string[],
  query: string,
): boolean {
  const needle = toLatin(query.trim().toLowerCase());
  if (!needle) return true;
  return fields.some((field) => toLatin(field.toLowerCase()).includes(needle));
}
