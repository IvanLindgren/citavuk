import { describe, expect, it } from 'vitest';

import { sampleParagraphs, tooHardFor } from './level';

describe('предупреждение о сложной книге', () => {
  // Разрыв в две ступени, а не в одну: читать на ступень выше своего уровня как
  // раз и полезно, и отговаривать от этого значит мешать единственному способу
  // вырасти. Правило то же, что на сервере.
  it('срабатывает только при разрыве в две ступени', () => {
    expect(tooHardFor('C1', 'A2')).toBe(true);
    expect(tooHardFor('B2', 'A2')).toBe(true);
    expect(tooHardFor('B1', 'A2')).toBe(false);
    expect(tooHardFor('C1', 'B2')).toBe(false);
  });

  // Книга легче читателя — не повод ни о чём предупреждать.
  it('молчит на лёгкой книге', () => {
    expect(tooHardFor('A1', 'C1')).toBe(false);
  });

  // Уровень читателя неизвестен — сравнивать не с чем. Выдумывать его нельзя:
  // на этой оценке стоит предупреждение, которое человек примет всерьёз.
  it('молчит, когда уровень неизвестен', () => {
    expect(tooHardFor('C1', '')).toBe(false);
    expect(tooHardFor('', 'A1')).toBe(false);
    expect(tooHardFor('черт-те что', 'A1')).toBe(false);
  });
});

describe('выборка абзацев для оценки', () => {
  // Короткую книгу отправляем целиком: резать нечего.
  it('короткий текст отдаёт как есть', () => {
    const paragraphs = ['раз', 'два', 'три'];
    expect(sampleParagraphs(paragraphs)).toEqual(paragraphs);
  });

  // Пустые абзацы места в выборке не занимают: слов в них нет, а оценка идёт по
  // словам.
  it('выбрасывает пустые абзацы', () => {
    expect(sampleParagraphs(['раз', '', '   ', 'два'])).toEqual(['раз', 'два']);
  });

  // Судить о книге по её началу нельзя: у переводных изданий там выходные
  // данные, у учебников — предисловие на другом языке. Выборка обязана
  // доставать и до конца.
  it('берёт абзацы по всей книге, а не только сначала', () => {
    const paragraphs = Array.from({ length: 1000 }, (_, i) => `абзац ${i}`);
    const sample = sampleParagraphs(paragraphs);

    expect(sample.length).toBeLessThan(paragraphs.length);
    expect(sample[0]).toBe('абзац 0');
    expect(sample.some((item) => Number(item.split(' ')[1]) > 900)).toBe(true);
  });
});
