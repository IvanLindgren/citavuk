import { describe, expect, it } from 'vitest';

import { sentenceWindow, utf8ByteOffset } from './translate';

describe('пересчёт смещений в байты UTF-8', () => {
  // Сервер написан на Go, где строка — это байты UTF-8, а JavaScript индексирует
  // строку в единицах UTF-16. Для латиницы числа совпадают, для кириллицы — нет,
  // и без пересчёта тегом пометилось бы не то слово: перевод «в контексте» тихо
  // начал бы возвращать значение соседнего слова.
  const bytes = (text: string) => new TextEncoder().encode(text);

  const slice = (text: string, from: number, to: number) =>
    new TextDecoder().decode(
      bytes(text).slice(utf8ByteOffset(text, from), utf8ByteOffset(text, to)),
    );

  it('латиница: смещения совпадают с индексами', () => {
    const sentence = 'Ovo je velika kuća sa baštom.';
    const start = sentence.indexOf('kuća');
    expect(utf8ByteOffset(sentence, start)).toBe(start);
  });

  it('кириллица: индекс и байтовое смещение расходятся', () => {
    const sentence = 'Ово је прва глава књиге.';
    const start = sentence.indexOf('прва');
    expect(utf8ByteOffset(sentence, start)).not.toBe(start);
    expect(slice(sentence, start, start + 'прва'.length)).toBe('прва');
  });

  it('диакритика сербской латиницы вырезается верно', () => {
    const sentence = 'Čitam knjigu o džezu i đacima.';
    for (const word of ['Čitam', 'džezu', 'đacima']) {
      const start = sentence.indexOf(word);
      expect(slice(sentence, start, start + word.length)).toBe(word);
    }
  });

  it('суррогатная пара не рассекается', () => {
    // Эмодзи занимает две единицы UTF-16 и четыре байта UTF-8 — самый опасный
    // случай для пересчёта.
    const sentence = 'Волк 🐺 чита књигу.';
    const start = sentence.indexOf('књигу');
    expect(slice(sentence, start, start + 'књигу'.length)).toBe('књигу');
  });

  it('границы не роняют пересчёт', () => {
    const sentence = 'Кратка реченица.';
    expect(utf8ByteOffset(sentence, 0)).toBe(0);
    expect(utf8ByteOffset(sentence, -5)).toBe(0);
    expect(utf8ByteOffset(sentence, sentence.length)).toBe(bytes(sentence).length);
    expect(utf8ByteOffset(sentence, 1000)).toBe(bytes(sentence).length);
    expect(utf8ByteOffset('', 5)).toBe(0);
  });
});

describe('окно предложения вокруг слова', () => {
  it('вырезает только своё предложение', () => {
    const text = 'Прво реченица. Друга реченица са речју. Трећа реченица.';
    const start = text.indexOf('речју');
    const window = sentenceWindow(text, start, start + 'речју'.length);

    expect(window.text).toBe('Друга реченица са речју.');
    // Границы обязаны указывать на то же слово уже внутри окна.
    expect(window.text.slice(window.start, window.end)).toBe('речју');
  });

  it('работает на первом и последнем предложении', () => {
    const text = 'Прва реч овде. Друга овде.';
    const first = sentenceWindow(text, 0, 4);
    expect(first.text.slice(first.start, first.end)).toBe('Прва');

    const lastStart = text.indexOf('Друга');
    const last = sentenceWindow(text, lastStart, lastStart + 5);
    expect(last.text.slice(last.start, last.end)).toBe('Друга');
  });

  it('обрезает абзац без единой точки', () => {
    // В книгах встречаются длинные периоды без знаков конца предложения:
    // отправлять их целиком значит замедлить ответ и ухудшить выравнивание.
    const long = `${'дуга реч '.repeat(200)}циљ ${'још речи '.repeat(200)}`;
    const start = long.indexOf('циљ');
    const window = sentenceWindow(long, start, start + 3, 300);

    expect(window.text.length).toBeLessThanOrEqual(300);
    expect(window.text.slice(window.start, window.end)).toBe('циљ');
  });

  it('текст без знаков конца возвращается целиком', () => {
    const text = 'кратак текст без тачке';
    const start = text.indexOf('без');
    const window = sentenceWindow(text, start, start + 3);

    expect(window.text).toBe(text);
    expect(window.text.slice(window.start, window.end)).toBe('без');
  });
});
