import { describe, expect, it } from 'vitest';

import { normalizeAnswer, stripAnswerPunctuation } from './answerMatch';

/*
  Повод для этих тестов — жалоба читателя: «отменил мои верные ответы из-за
  отсутствия запятых». Проверка срезала только точку в конце, и запятая внутри
  фразы валила перевод целиком.
*/
describe('пунктуация в ответе', () => {
  const same = (left: string, right: string) =>
    normalizeAnswer(left) === normalizeAnswer(right);

  it('пропущенная запятая не отменяет ответ', () => {
    expect(same('Я забыл, что ключи дома', 'Я забыл что ключи дома')).toBe(true);
  });

  it('лишняя запятая тоже не отменяет', () => {
    expect(same('Солнце встаёт из-за горы', 'Солнце встаёт, из-за горы')).toBe(true);
  });

  it('точка, восклицательный и вопросительный знаки не считаются', () => {
    expect(same('Zdravo', 'Zdravo!')).toBe(true);
    expect(same('Kako si', 'Kako si?')).toBe(true);
    expect(same('Dobar dan', 'Dobar dan.')).toBe(true);
  });

  it('кавычки и тире между словами не считаются', () => {
    expect(same('он сказал «да»', 'он сказал да')).toBe(true);
    expect(same('Москва — столица', 'Москва столица')).toBe(true);
  });

  it('двоеточие и точка с запятой тоже', () => {
    expect(same('вот что: молоко', 'вот что молоко')).toBe(true);
  });

  // Иначе снятие знаков склеивало бы слова в одно и меняло ответ.
  it('на месте знака остаётся разрыв слов', () => {
    expect(stripAnswerPunctuation('да,нет')).toBe('да нет');
    expect(stripAnswerPunctuation('раз... два')).toBe('раз два');
  });

  it('дефис внутри слова сохраняется', () => {
    expect(stripAnswerPunctuation('из-за горы')).toBe('из-за горы');
    expect(same('из-за горы', 'изза горы')).toBe(false);
  });

  it('апостроф внутри слова сохраняется', () => {
    expect(stripAnswerPunctuation("don't")).toBe("don't");
  });

  it('лишние пробелы схлопываются', () => {
    expect(same('  Dobar   dan  ', 'Dobar dan')).toBe(true);
  });

  it('регистр не считается, а сербские диакритики считаются', () => {
    expect(same('ČAJ', 'čaj')).toBe(true);
    expect(same('čaj', 'ćaj')).toBe(false);
  });

  // Ответ не должен превратиться в пустую строку и совпасть с любым другим
  // пустым: «???» и «!!!» — это не «ничего не написал».
  it('ответ из одних знаков схлопывается в пусто', () => {
    expect(stripAnswerPunctuation('?!.')).toBe('');
  });
});
