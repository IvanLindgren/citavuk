import { describe, expect, it } from 'vitest';

import { TTS_MAX_CHARS, speechChunks } from './speech';

/**
 * Проверяется ровно то, из-за чего озвучка карточек не работала: сервер молча
 * отвечает 400 на текст длиннее предела. Поэтому главное свойство здесь одно —
 * ни один кусок не длиннее предела, каким бы ни был текст.
 */

const sentence = (words: number, word = 'reč') =>
  `${Array.from({ length: words }, () => word).join(' ')}.`;

describe('нарезка текста для озвучки', () => {
  it('короткий текст остаётся одним куском', () => {
    expect(speechChunks('Zdravo svete.')).toEqual(['Zdravo svete.']);
  });

  it('пустой текст не даёт запросов', () => {
    expect(speechChunks('   ')).toEqual([]);
  });

  // Карточка Вукотока — 100–150 слов. Ровно этот случай раньше давал 400.
  it('карточка режется на куски в пределах ограничения сервера', () => {
    const card = Array.from({ length: 14 }, (_, index) => sentence(9, `slovo${index}`)).join(' ');
    expect(card.length).toBeGreaterThan(TTS_MAX_CHARS);

    const chunks = speechChunks(card);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(TTS_MAX_CHARS);
  });

  it('текст не теряется и не переставляется', () => {
    const card = Array.from({ length: 14 }, (_, index) => sentence(9, `slovo${index}`)).join(' ');
    expect(speechChunks(card).join(' ')).toBe(card);
  });

  // Пауза между кусками слышна всегда. На точке она звучит как пауза между
  // фразами, посреди фразы — как заедание.
  it('режет по границе предложения, пока это возможно', () => {
    const card = Array.from({ length: 14 }, (_, index) => sentence(9, `slovo${index}`)).join(' ');
    for (const chunk of speechChunks(card)) expect(chunk).toMatch(/[.!?…]$/);
  });

  it('соседние предложения объединяются, пока помещаются', () => {
    // Три коротких предложения помещаются в один кусок — три запроса вместо
    // одного дали бы три паузы на ровном месте.
    expect(speechChunks('Prvo. Drugo. Treće.', 40)).toEqual(['Prvo. Drugo. Treće.']);
  });

  describe('текст без точек', () => {
    it('абзац без единой точки режется по словам', () => {
      const chunks = speechChunks(`${sentence(200).slice(0, -1)}`, 100);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
      expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(sentence(200).slice(0, -1));
    });

    it('слово длиннее предела режется по буквам, а не пропадает', () => {
      const long = 'a'.repeat(250);
      const chunks = speechChunks(long, 100);
      expect(chunks).toHaveLength(3);
      expect(chunks.join('')).toBe(long);
    });
  });

  it('кусок никогда не начинается с пробела', () => {
    for (const chunk of speechChunks(sentence(300), 120)) {
      expect(chunk).toBe(chunk.trim());
      expect(chunk).not.toBe('');
    }
  });
});
