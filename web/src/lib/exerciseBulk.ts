import type { LessonExercise } from '../api/lessons';

/**
 * Набор однотипных заданий из списка строк.
 *
 * Десять слов на один и тот же приём — обычная работа преподавателя, и делать
 * ради них десять заходов «добавить задание → выбрать тип → заполнить поля»
 * незачем: отличается в них одна строка. Здесь список строк превращается в
 * список заданий за один раз.
 *
 * Разбор отделён от вёрстки намеренно: у него есть верные и неверные ответы, и
 * это единственная часть, которую можно проверить тестами.
 */

/** Типы, у которых строка целиком описывает одно задание. */
export type BulkType =
  | 'fill_blank'
  | 'multiple_choice'
  | 'letter_unscramble'
  | 'explain_word'
  | 'sentence_builder';

export interface BulkFormat {
  type: BulkType;
  label: string;
  /** Как устроена строка. Показывается прямо над полем ввода. */
  hint: string;
  example: string;
}

/** Разделитель частей строки. Вертикальная черта в сербском тексте не живёт. */
const SEPARATOR = '|';

/** Пометка правильного варианта. */
const CORRECT_MARK = '*';

export const BULK_FORMATS: BulkFormat[] = [
  {
    type: 'fill_blank',
    label: 'Заполнить пропуск',
    hint: 'Предложение с ___ на месте ответа, потом ответы через запятую.',
    example: 'Ona ___ srpski svaki dan. | govori, uči\nMi ___ u Beogradu. | živimo',
  },
  {
    type: 'multiple_choice',
    label: 'Выбор ответа',
    hint: `Вопрос, потом варианты. Правильный помечается звёздочкой: ${CORRECT_MARK}вариант.`,
    example: 'Šta znači «kuća»? | *дом | собака | стол\nŠta znači «reka»? | стол | *река',
  },
  {
    type: 'letter_unscramble',
    label: 'Собрать слово',
    hint: 'Подсказка, потом само слово.',
    example: 'Дом по-сербски | kuća\nРека по-сербски | reka',
  },
  {
    type: 'explain_word',
    label: 'Объяснить слово',
    hint: 'Слово, потом пример хорошего объяснения по-сербски.',
    example: 'kuća | Место где живи породица.\nreka | Вода која тече кроз поље.',
  },
  {
    type: 'sentence_builder',
    label: 'Собрать предложение',
    hint: 'По одному предложению в строке — слова станут плитками.',
    example: 'Ja učim srpski jezik\nOna živi u Novom Sadu',
  },
];

export interface BulkProblem {
  /** Номер строки, начиная с единицы: человек видит их именно так. */
  line: number;
  message: string;
}

export interface BulkResult {
  exercises: LessonExercise[];
  problems: BulkProblem[];
}

/**
 * Разбирает список строк в задания.
 *
 * Плохая строка не отменяет остальные: из десяти строк с одной опечаткой
 * получаются девять заданий и одно внятное замечание. Отказать целиком значило
 * бы заставить искать опечатку в текстовом поле без подсветки.
 */
export function parseBulk(
  type: BulkType,
  text: string,
  makeId: () => string = () => crypto.randomUUID(),
): BulkResult {
  const exercises: LessonExercise[] = [];
  const problems: BulkProblem[] = [];

  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') return;
    const number = index + 1;

    const parts = line.split(SEPARATOR).map((part) => part.trim());
    const head = parts[0] ?? '';
    const rest = parts.slice(1).filter((part) => part !== '');

    if (head === '') {
      problems.push({ line: number, message: 'Строка начинается с разделителя.' });
      return;
    }
    if (type !== 'sentence_builder' && rest.length === 0) {
      problems.push({ line: number, message: `Нет части после «${SEPARATOR}».` });
      return;
    }

    const base = { id: makeId(), type, prompt: '' } as LessonExercise;

    if (type === 'fill_blank') {
      if (!head.includes('___')) {
        problems.push({ line: number, message: 'В предложении нет ___ на месте ответа.' });
        return;
      }
      const answers = rest
        .join(',')
        .split(',')
        .map((answer) => answer.trim())
        .filter((answer) => answer !== '');
      if (answers.length === 0) {
        problems.push({ line: number, message: 'Не указан ни один ответ.' });
        return;
      }
      exercises.push({
        ...base,
        context: head,
        acceptedAnswers: answers,
        answer: answers[0]!,
        referenceAnswer: answers[0]!,
      });
      return;
    }

    if (type === 'multiple_choice') {
      const options = rest.map((option) => option.replace(CORRECT_MARK, '').trim());
      const correctAt = rest.findIndex((option) => option.startsWith(CORRECT_MARK));
      if (options.length < 2) {
        problems.push({ line: number, message: 'Нужно хотя бы два варианта.' });
        return;
      }
      if (correctAt < 0) {
        problems.push({
          line: number,
          message: `Правильный вариант не помечен звёздочкой (${CORRECT_MARK}).`,
        });
        return;
      }
      const answer = options[correctAt]!;
      exercises.push({ ...base, prompt: head, options, answer, referenceAnswer: answer });
      return;
    }

    if (type === 'letter_unscramble') {
      const word = rest[0]!;
      exercises.push({
        ...base,
        context: head,
        answer: word,
        referenceAnswer: word,
        tokens: [...word],
        distractors: [],
      });
      return;
    }

    if (type === 'explain_word') {
      const sample = rest.join(' ');
      exercises.push({ ...base, context: head, answer: sample, referenceAnswer: sample });
      return;
    }

    // sentence_builder: вся строка — предложение, слова станут плитками.
    const tokens = head.split(/\s+/).filter((token) => token !== '');
    if (tokens.length < 2) {
      problems.push({ line: number, message: 'В предложении меньше двух слов.' });
      return;
    }
    exercises.push({
      ...base,
      tokens,
      distractors: [],
      answer: tokens.join(' '),
      referenceAnswer: tokens.join(' '),
    });
  });

  return { exercises, problems };
}
