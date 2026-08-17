import { describe, expect, it } from 'vitest';

import {
  CARDS_PER_PAGE,
  CARD_COLUMNS,
  cardPages,
  exportFileName,
  toCsv,
  type ExportRow,
} from './vocabExport';

const row = (word: string, translation = 'перевод'): ExportRow => ({
  word,
  translation,
  context: '',
  tags: [],
});

describe('таблица', () => {
  it('первая строка — заголовок', () => {
    expect(toCsv([]).split('\r\n')[0]).toBe('﻿слово;перевод;пример;метки');
  });

  it('поля идут в объявленном порядке', () => {
    const csv = toCsv([
      { word: 'hleb', translation: 'хлеб', context: 'Купио сам хлеб.', tags: ['еда'] },
    ]);
    expect(csv.split('\r\n')[1]).toBe('hleb;хлеб;Купио сам хлеб.;еда');
  });

  // В переводе запятая — обычное дело («творог, сыр»), а разделитель у нас
  // точка с запятой: без экранирования строка разъезжается на лишние столбцы.
  it('разделители внутри поля экранируются', () => {
    const csv = toCsv([row('sir', 'творог, сыр')]);
    expect(csv).toContain('sir;"творог, сыр";;');
  });

  it('кавычки внутри поля удваиваются', () => {
    const csv = toCsv([row('reč', 'слово "речь"')]);
    expect(csv).toContain('"слово ""речь"""');
  });

  // Пример — целое предложение и может содержать перенос: строка CSV его не
  // переживёт, поэтому переносы схлопываются в пробел.
  it('переносы строк не рвут запись', () => {
    const csv = toCsv([
      { word: 'x', translation: 'y', context: 'Прва\nдруга', tags: [] },
    ]);
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv).toContain('Прва друга');
  });

  // Без BOM Excel читает кириллицу как «Ð¡Ð»Ð¾Ð²Ð¾».
  it('файл начинается с BOM', () => {
    expect(toCsv([]).charCodeAt(0)).toBe(0xfeff);
  });
});

describe('печатные карточки', () => {
  const many = Array.from({ length: CARDS_PER_PAGE + 2 }, (_, i) => row(`w${i}`));

  it('лист вмещает ровно сетку', () => {
    const pages = cardPages(many);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.front).toHaveLength(CARDS_PER_PAGE);
  });

  // Сетка обязана остаться той же, иначе последний лист разрежется по другим
  // линиям, чем предыдущие.
  it('неполный лист добивается пустыми местами', () => {
    const last = cardPages(many)[1]!;
    expect(last.front).toHaveLength(CARDS_PER_PAGE);
    expect(last.front.filter(Boolean)).toHaveLength(2);
    expect(last.front[CARDS_PER_PAGE - 1]).toBeNull();
  });

  // Главное во всей раскладке: печать переворачивает лист по длинному краю, и
  // левый столбец лица оказывается напротив правого столбца оборота.
  it('оборот зеркалится по строкам', () => {
    const page = cardPages(many)[0]!;
    for (let line = 0; line < 2; line++) {
      for (let column = 0; column < CARD_COLUMNS; column++) {
        const face = page.front[line * CARD_COLUMNS + column];
        const mirrored =
          page.back[line * CARD_COLUMNS + (CARD_COLUMNS - 1 - column)];
        expect(mirrored).toBe(face);
      }
    }
  });

  it('пустой словарь листов не даёт', () => {
    expect(cardPages([])).toEqual([]);
  });
});

describe('имя файла', () => {
  it('содержит дату и расширение', () => {
    expect(exportFileName('csv')).toMatch(/^citavuk-slovar-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
