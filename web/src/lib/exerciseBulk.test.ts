import { describe, expect, it } from 'vitest';

import { parseBulk } from './exerciseBulk';

/**
 * Десять слов на один приём — обычная работа преподавателя. Разбор существует
 * ради того, чтобы это был один заход вместо десяти, поэтому важнее всего два
 * его свойства: он не теряет строки и не молчит об опечатках.
 */

let counter = 0;
const id = () => `id-${++counter}`;

describe('набор заданий', () => {
  it('каждая строка даёт своё задание', () => {
    const { exercises, problems } = parseBulk(
      'fill_blank',
      'Ona ___ srpski. | govori\nMi ___ u Beogradu. | živimo\nOn ___ knjigu. | čita',
      id,
    );
    expect(problems).toEqual([]);
    expect(exercises).toHaveLength(3);
    expect(exercises[0]).toMatchObject({
      type: 'fill_blank',
      context: 'Ona ___ srpski.',
      acceptedAnswers: ['govori'],
      answer: 'govori',
    });
  });

  it('несколько допустимых ответов через запятую', () => {
    const { exercises } = parseBulk('fill_blank', 'Ona ___ srpski. | govori, uči', id);
    expect(exercises[0]!.acceptedAnswers).toEqual(['govori', 'uči']);
    // Первый ответ считается образцовым: его показывают при проверке.
    expect(exercises[0]!.answer).toBe('govori');
  });

  // Плохая строка не должна отменять остальные: искать опечатку в текстовом
  // поле без подсветки — то самое неудобство, ради которого всё делалось.
  it('опечатка в одной строке не отменяет остальные', () => {
    const { exercises, problems } = parseBulk(
      'fill_blank',
      'Ona ___ srpski. | govori\nЗдесь нет пропуска | ответ\nOn ___ knjigu. | čita',
      id,
    );
    expect(exercises).toHaveLength(2);
    expect(problems).toEqual([{ line: 2, message: 'В предложении нет ___ на месте ответа.' }]);
  });

  it('пустые строки просто пропускаются', () => {
    const { exercises, problems } = parseBulk(
      'fill_blank',
      '\n  \nOna ___ srpski. | govori\n\n',
      id,
    );
    expect(exercises).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  describe('выбор ответа', () => {
    it('звёздочка помечает правильный вариант и в него не попадает', () => {
      const { exercises } = parseBulk(
        'multiple_choice',
        'Šta znači «kuća»? | *дом | собака | стол',
        id,
      );
      expect(exercises[0]).toMatchObject({
        prompt: 'Šta znači «kuća»?',
        options: ['дом', 'собака', 'стол'],
        answer: 'дом',
      });
    });

    // Варианты показываются ученику в том порядке, в каком их ввели, поэтому
    // «правильный всегда первый» было бы подсказкой, а не заданием.
    it('правильный вариант может стоять не первым', () => {
      const { exercises } = parseBulk('multiple_choice', 'Šta? | стол | *река', id);
      expect(exercises[0]!.options).toEqual(['стол', 'река']);
      expect(exercises[0]!.answer).toBe('река');
    });

    it('без пометки — внятное замечание, а не молчаливое задание без ответа', () => {
      const { exercises, problems } = parseBulk('multiple_choice', 'Šta? | дом | река', id);
      expect(exercises).toHaveLength(0);
      expect(problems[0]!.message).toContain('звёздочкой');
    });

    it('один вариант заданием не считается', () => {
      const { problems } = parseBulk('multiple_choice', 'Šta? | *дом', id);
      expect(problems[0]!.message).toContain('два варианта');
    });
  });

  it('собрать слово: буквы берутся из самого слова', () => {
    const { exercises } = parseBulk('letter_unscramble', 'Дом по-сербски | kuća', id);
    expect(exercises[0]).toMatchObject({ context: 'Дом по-сербски', answer: 'kuća' });
    expect(exercises[0]!.tokens).toEqual(['k', 'u', 'ć', 'a']);
  });

  it('собрать предложение: слова становятся плитками', () => {
    const { exercises } = parseBulk('sentence_builder', 'Ja učim srpski jezik', id);
    expect(exercises[0]!.tokens).toEqual(['Ja', 'učim', 'srpski', 'jezik']);
    expect(exercises[0]!.answer).toBe('Ja učim srpski jezik');
  });

  it('предложение из одного слова собирать нечего', () => {
    const { problems } = parseBulk('sentence_builder', 'Zdravo', id);
    expect(problems[0]!.message).toContain('двух слов');
  });

  it('объяснить слово: слово и образец объяснения', () => {
    const { exercises } = parseBulk('explain_word', 'kuća | Место где живи породица.', id);
    expect(exercises[0]).toMatchObject({
      context: 'kuća',
      referenceAnswer: 'Место где живи породица.',
    });
  });

  it('строка без второй части не проходит молча', () => {
    const { exercises, problems } = parseBulk('letter_unscramble', 'Только подсказка', id);
    expect(exercises).toHaveLength(0);
    expect(problems[0]!.message).toContain('после');
  });

  it('у каждого задания свой идентификатор', () => {
    const { exercises } = parseBulk(
      'letter_unscramble',
      'Дом | kuća\nРека | reka\nСтол | sto',
      id,
    );
    expect(new Set(exercises.map((exercise) => exercise.id)).size).toBe(3);
  });
});
