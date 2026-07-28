import { describe, expect, it } from 'vitest';

import { contentSha } from './content';

// Спецсимволы собираются из кодов, а не пишутся escape-строками: U+2028 и
// нулевой байт невидимы в редакторе, и случайная замена такого символа на
// пробел тихо превратила бы проверку в бессмысленную.
const LINE_SEPARATOR = String.fromCharCode(0x2028); // разделитель строк из Word
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const NUL = String.fromCharCode(0);
const FORM_FEED = String.fromCharCode(0x0c); // разрыв страницы из PDF

describe('адрес текста книги', () => {
  // Эталоны посчитаны сервером и зафиксированы там же:
  // server/internal/store/content_test.go, набор contentSHACases.
  //
  // Совпадение обязательно: клиент считает адрес перед выгрузкой, сервер
  // пересчитывает его и отвергает запрос при расхождении. Разойдись
  // вычисление хоть на байт — синхронизация книг перестала бы работать
  // целиком, и ни один другой тест этого бы не заметил.
  const cases: Array<[string, string[], string]> = [
    [
      'пустая книга',
      [],
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ],
    [
      'кириллица',
      ['Ово је прва глава књиге.'],
      'f3fb817fbd63a9ec257919e9e49f6e996a3796d56cf23729b4d8e76bdbbe0416',
    ],
    [
      'латиница с диакритикой и символы разметки',
      ['Čitao sam je celu noć.', 'Услов a < b & c > d важен.'],
      'e31a9b3cbf2739c71b14dc31ea5814972e365fbb8e3e758cca18d3e7fbcb0c8a',
    ],
    [
      'кавычки и обратный слеш',
      [String.raw`Строка с "кавычками" и \обратным слешем`],
      'd986a5435558931f70725e03c17cd555695ddafd92b528f09a59244779358190',
    ],
    [
      'эмодзи и перевод строки',
      ['Эмодзи 🐺 и перевод строки\nвнутри абзаца'],
      '103c345eb3ea11a8b1dba09c9143ede26dfb2c86113f84e6a79fb5de2dd6528f',
    ],
    [
      // Ровно на этих символах Go расходился с JavaScript, пока адрес считался
      // из JSON: Go экранирует их всегда, JSON.stringify — никогда.
      'разделители строк из Word',
      [`текст${LINE_SEPARATOR}ещё`, `и${PARAGRAPH_SEPARATOR}ещё`],
      'db90688d1131f3c24c0817de7216cad03ab41c3cb984be2316940b52df80b46a',
    ],
    [
      'перевод страницы и табуляция',
      [`Прва глава.${FORM_FEED}Друга глава.`, 'с\tтабуляцией'],
      '08c885fe43153e27e85bac24c9ccdb818f8bb3dd9fab8928829eac326a991289',
    ],
  ];

  for (const [name, paragraphs, expected] of cases) {
    it(`совпадает с сервером: ${name}`, async () => {
      expect(await contentSha(paragraphs)).toBe(expected);
    });
  }

  it('меняется при любой правке текста', async () => {
    const base = await contentSha(['Први пасус.', 'Други пасус.']);
    expect(await contentSha(['Први пасус.', 'Други пасус!'])).not.toBe(base);
    expect(await contentSha(['Други пасус.', 'Први пасус.'])).not.toBe(base);
  });

  it('разбиение на абзацы влияет на адрес при любом содержимом', async () => {
    const two = await contentSha(['а', 'б']);

    // Тот же текст одним абзацем, склеенный любым разделителем — включая тот,
    // которым выглядит сама рамка.
    for (const join of ['', NUL, '\n', ' ', '\t', LINE_SEPARATOR, '2\n']) {
      expect(await contentSha([`а${join}б`])).not.toBe(two);
    }

    expect(await contentSha(['аб', 'вг'])).not.toBe(await contentSha(['а', 'бвг']));
  });

  it('не зависит от того, как текст попал в приложение', async () => {
    // Одна и та же книга из PDF и из DOCX даёт разные файлы, но одинаковые
    // абзацы — и не должна храниться дважды.
    expect(await contentSha(['Прва глава.', 'Друга глава.'])).toBe(
      await contentSha(['Прва глава.', 'Друга глава.']),
    );
  });
});
