import { describe, expect, it } from 'vitest';

import { splitParagraphs, toLatin, tokenize } from './tokenize';

describe('разбиение на токены', () => {
  it('отделяет слова от пунктуации', () => {
    const tokens = tokenize('Ovo je kuća.');
    const words = tokens.filter((t) => t.isWord).map((t) => t.text);
    expect(words).toEqual(['Ovo', 'je', 'kuća']);
  });

  it('смещения указывают на исходную строку', () => {
    // Смещения уходят на сервер при переводе слова в контексте: ошибка здесь
    // означает перевод не того слова.
    const text = 'Ово је велика кућа са баштом.';
    for (const token of tokenize(text)) {
      expect(text.slice(token.start, token.end)).toBe(token.text);
    }
  });

  it('склеивает текст обратно без потерь', () => {
    const text = 'Čitao sam je celu noć — bila je divna!';
    expect(tokenize(text).map((t) => t.text).join('')).toBe(text);
  });

  it('сохраняет сербскую диакритику', () => {
    const words = tokenize('Čitam o džezu i đacima, ćuti')
      .filter((t) => t.isWord)
      .map((t) => t.text);
    expect(words).toEqual(['Čitam', 'o', 'džezu', 'i', 'đacima', 'ćuti']);
  });

  it('дефис внутри слова его не разрывает', () => {
    const words = tokenize('српско-руски речник').filter((t) => t.isWord);
    expect(words.map((t) => t.text)).toEqual(['српско-руски', 'речник']);
  });

  it('дефис как тире словом не считается', () => {
    // «реч — друга» это два слова и тире, а не одно длинное слово.
    const words = tokenize('реч — друга').filter((t) => t.isWord);
    expect(words.map((t) => t.text)).toEqual(['реч', 'друга']);
  });

  it('цифры не попадают в слова', () => {
    const words = tokenize('У 2026. години').filter((t) => t.isWord);
    expect(words.map((t) => t.text)).toEqual(['У', 'години']);
  });

  it('пустая строка даёт пустой список', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('перевод кириллицы в латиницу', () => {
  it('переводит однобуквенные соответствия', () => {
    expect(toLatin('кућа')).toBe('kuća');
    expect(toLatin('читам')).toBe('čitam');
  });

  it('раскрывает диграфы', () => {
    // љ, њ и џ — по одной букве кириллицей и по две латиницей.
    expect(toLatin('љубав')).toBe('ljubav');
    expect(toLatin('књига')).toBe('knjiga');
    expect(toLatin('џеп')).toBe('džep');
  });

  it('сохраняет регистр, а не только букву', () => {
    expect(toLatin('Њега')).toBe('Njega');
    expect(toLatin('Београд')).toBe('Beograd');
  });

  it('латиницу не трогает', () => {
    expect(toLatin('Beograd')).toBe('Beograd');
    expect(toLatin('kuća')).toBe('kuća');
  });
});

describe('разбиение на абзацы', () => {
  it('делит по пустой строке', () => {
    expect(splitParagraphs('Први.\n\nДруги.\n\nТрећи.')).toEqual([
      'Први.',
      'Други.',
      'Трећи.',
    ]);
  });

  it('отбрасывает пустые и схлопывает пробелы', () => {
    expect(splitParagraphs('Први.\n\n\n\n   \n\nДруги    текст.')).toEqual([
      'Први.',
      'Други текст.',
    ]);
  });

  it('текст без пустых строк остаётся одним абзацем', () => {
    expect(splitParagraphs('Једна\nдруга\nтрећа')).toEqual(['Једна друга трећа']);
  });
});
