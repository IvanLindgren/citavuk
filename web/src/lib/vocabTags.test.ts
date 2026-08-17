import { describe, expect, it } from 'vitest';

import type { Review } from './vocabulary';
import {
  freqTag,
  isPhrase,
  matchesQuery,
  posTag,
  progressTag,
  placeOf,
  scriptOf,
  tagCounts,
  tagsFor,
  topicTags,
} from './vocabTags';

const review = (patch: Partial<Review> = {}): Review => ({
  vocabId: 'v1',
  ease: 2.5,
  intervalDays: 0,
  reps: 0,
  dueAt: 0,
  lastReviewed: null,
  deleted: 0,
  updatedAt: 0,
  dirty: 0,
  ...patch,
});

describe('вид записи', () => {
  // Из книги в словарь уходит выделенный кусок целиком, и таких записей
  // набирается едва ли не половина. Отделить их — и есть главная задача меток.
  it('фраза отличается от слова по пробелу', () => {
    expect(isPhrase('kuća')).toBe(false);
    expect(isPhrase('  kuća  ')).toBe(false);
    expect(isPhrase('mala kuća')).toBe(true);
    expect(isPhrase('Колико кошта?')).toBe(true);
  });
});

describe('письмо', () => {
  it('различает кириллицу и латиницу', () => {
    expect(scriptOf('кућа')).toBe('кириллица');
    expect(scriptOf('kuća')).toBe('латиница');
  });

  // Спорную запись лучше не относить никуда, чем отнести неверно.
  it('смешанное и бесписьменное остаётся без метки', () => {
    expect(scriptOf('кућа Wi-Fi')).toBeNull();
    expect(scriptOf('123')).toBeNull();
    expect(scriptOf('')).toBeNull();
  });
});

describe('часть речи', () => {
  it('переводит UD-теги в человеческие названия', () => {
    expect(posTag('NOUN')).toBe('существительное');
    expect(posTag('VERB')).toBe('глагол');
    // Вспомогательный глагол для читателя всё равно глагол.
    expect(posTag('AUX')).toBe('глагол');
  });

  // «Слово» ничего не разделяет, а метка, под которую попадает половина
  // словаря, хуже её отсутствия.
  it('неопределённость метки не даёт', () => {
    expect(posTag('UNKNOWN')).toBeNull();
    expect(posTag('X')).toBeNull();
    expect(posTag('')).toBeNull();
  });
});

describe('как идёт запоминание', () => {
  it('несмотренное слово — новое', () => {
    expect(progressTag(review())).toBe('новое');
  });

  it('месячный интервал считается выученным', () => {
    expect(progressTag(review({ reps: 5, intervalDays: 30 }))).toBe('выучено');
  });

  // Просевшая лёгкость — единственный признак слова, которое раз за разом
  // забывается. Найти его иначе нечем.
  it('просевшая лёгкость делает слово трудным', () => {
    expect(progressTag(review({ reps: 4, intervalDays: 2, ease: 1.9 }))).toBe('трудное');
  });

  it('обычный ход — учу', () => {
    expect(progressTag(review({ reps: 2, intervalDays: 3 }))).toBe('учу');
  });

  // Слово с месячным интервалом трудным не бывает, даже если лёгкость просела
  // когда-то раньше: месяц без ошибки важнее старой оценки.
  it('выучено сильнее трудного', () => {
    expect(progressTag(review({ reps: 9, intervalDays: 40, ease: 1.5 }))).toBe('выучено');
  });
});

describe('темы', () => {
  it('слово получает тему из указателя', () => {
    expect(topicTags('hleb')).toContain('еда');
    expect(topicTags('recept')).toContain('здоровье');
  });

  // Сохранить слово можно из книги на любом из двух писем.
  it('кириллица и латиница дают одну тему', () => {
    expect(topicTags('хлеб')).toEqual(topicTags('hleb'));
  });

  it('регистр и хвостовые знаки не мешают', () => {
    expect(topicTags('Hleb,')).toContain('еда');
  });

  it('у фразы темы не ищутся', () => {
    expect(topicTags('Дајте ми хлеб')).toEqual([]);
  });

  it('незнакомое слово остаётся без темы', () => {
    expect(topicTags('квазимодогенез')).toEqual([]);
  });
});

describe('метки записи целиком', () => {
  it('слово размечается по всем разрядам', () => {
    const tags = tagsFor({ word: 'hleb', lemma: 'hleb', pos: 'NOUN' }, review());
    expect(tags.map((tag) => tag.id)).toEqual([
      'слово',
      'существительное',
      'латиница',
      'новое',
      'еда',
      'частое',
    ]);
  });

  // Часть речи у фразы описывала бы только первое слово: разбор идёт по одному.
  it('фраза не получает части речи', () => {
    const tags = tagsFor({ word: 'Колико кошта?', lemma: '', pos: 'NOUN' }, review());
    expect(tags.map((tag) => tag.kind)).not.toContain('pos');
    expect(tags[0]).toEqual({ id: 'фраза', kind: 'kind' });
  });
});

describe('насколько ходовое', () => {
  it('ядро языка отделено от просто частого', () => {
    expect(freqTag('biti', 'biti')).toBe('первая тысяча');
    expect(freqTag('hleb', 'hleb')).toBe('частое');
  });

  // Указатель ведётся по леммам: «кућама» в нём нет, а «кућа» есть.
  it('спрашивается начальная форма', () => {
    expect(freqTag('kućama', 'kuća')).toBe(freqTag('kuća', 'kuća'));
  });

  // Отсутствие значит и «редкое», и «начальную форму не распознали». Метка
  // «редкое» на неразобранном слове — уверенное враньё вместо молчания.
  it('слово вне указателя метки не получает', () => {
    expect(freqTag('квазимодогенез', 'квазимодогенез')).toBeNull();
  });
});

describe('место из Путешествия', () => {
  it('слово ведёт в место, где им пользуются', () => {
    expect(placeOf('burek')?.id).toBe('bakery');
    expect(placeOf('бурек')?.id).toBe('bakery');
  });

  it('у места есть оба названия', () => {
    expect(placeOf('burek')?.ru).toBe('пекарня');
    expect(placeOf('burek')?.sr).toBe('пекара');
  });

  it('у фразы места нет', () => {
    expect(placeOf('Дајте ми бурек')).toBeNull();
  });

  it('незнакомое слово места не получает', () => {
    expect(placeOf('квазимодогенез')).toBeNull();
  });
});

describe('метки с числами', () => {
  const tagged = [
    tagsFor({ word: 'hleb', lemma: 'hleb', pos: 'NOUN' }, review()),
    tagsFor({ word: 'burek', lemma: 'burek', pos: 'NOUN' }, review({ reps: 2, intervalDays: 3 })),
    tagsFor({ word: 'trčati', lemma: 'trčati', pos: 'VERB' }, review()),
  ];

  it('считает, сколько записей под каждой меткой', () => {
    const counts = new Map(tagCounts(tagged).map((item) => [item.tag.id, item.count]));
    expect(counts.get('еда')).toBe(2);
    expect(counts.get('существительное')).toBe(2);
    expect(counts.get('глагол')).toBe(1);
    expect(counts.get('новое')).toBe(2);
    expect(counts.get('учу')).toBe(1);
  });

  // Вид записи разложен отдельными кнопками выше ряда, и в самом ряду он был бы
  // вторым способом сделать то же самое.
  it('вид записи в ряд не попадает', () => {
    expect(tagCounts(tagged).map((item) => item.tag.kind)).not.toContain('kind');
  });

  it('темы идут первыми, внутри разряда — по убыванию числа', () => {
    const listed = tagCounts(tagged);
    expect(listed[0]?.tag.kind).toBe('topic');
    const pos = listed.filter((item) => item.tag.kind === 'pos');
    expect(pos.map((item) => item.count)).toEqual([2, 1]);
  });

  it('на пустом словаре ряд пуст', () => {
    expect(tagCounts([])).toEqual([]);
  });
});

describe('поиск', () => {
  it('находит по слову, переводу и контексту', () => {
    const fields = ['kuća', 'дом', 'Ovo je mala kuća.'];
    expect(matchesQuery(fields, 'kuć')).toBe(true);
    expect(matchesQuery(fields, 'дом')).toBe(true);
    expect(matchesQuery(fields, 'mala')).toBe(true);
    expect(matchesQuery(fields, 'корабль')).toBe(false);
  });

  // Слово сохранено латиницей, а вспомнилось кириллицей — и наоборот.
  it('письмо запроса не имеет значения', () => {
    expect(matchesQuery(['kuća'], 'кућа')).toBe(true);
    expect(matchesQuery(['кућа'], 'kuća')).toBe(true);
  });

  it('пустой запрос пропускает всё', () => {
    expect(matchesQuery(['kuća'], '   ')).toBe(true);
  });
});
