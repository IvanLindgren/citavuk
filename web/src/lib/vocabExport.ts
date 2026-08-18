import { isPhrase } from './vocabTags';

/**
 * Выгрузка словаря: таблицей и на бумагу.
 *
 * Часть людей всё равно учит в Anki, а часть — по бумажным карточкам, и
 * воевать с этим бессмысленнее, чем отдать словарь в их формате.
 *
 * PDF отдельным форматом здесь не делается: печать браузера умеет «сохранить
 * как PDF» на всех трёх системах, а своя генерация PDF потребовала бы тащить
 * библиотеку на полтора мегабайта ради того, что уже есть в самом браузере.
 * Разметка листа поэтому обычная, а всё расположение задано в `@media print`.
 */

export interface ExportRow {
  word: string;
  translation: string;
  context: string;
  tags: string[];
}

/**
 * Что имеет смысл резать ножницами.
 *
 * Фразы на бумагу не идут. Карточка — это 63×69 мм, и выделенный из книги кусок
 * набирается на ней шестым кеглем, а то и не влезает вовсе. Но дело не в
 * размере: карточку берут, чтобы вспомнить слово по одной стороне, а
 * предложение не вспоминают — его читают, и лицевая сторона выдаёт ответ
 * раньше, чем её успевают перевернуть.
 *
 * Фразам своё упражнение — сборка из слов в повторении; в CSV они тоже уходят
 * целиком. Отсекается здесь только бумага.
 */
export function printableRows(rows: readonly ExportRow[]): ExportRow[] {
  return rows.filter((row) => !isPhrase(row.word));
}

/** Сколько карточек на листе A4 и как они разложены. */
export const CARD_COLUMNS = 3;
export const CARD_ROWS = 4;
export const CARDS_PER_PAGE = CARD_COLUMNS * CARD_ROWS;

/**
 * Экранирование поля CSV.
 *
 * Кавычки удваиваются, а поле берётся в кавычки при любом разделителе внутри.
 * В словаре это не редкость: перевод сплошь и рядом идёт через запятую
 * («творог, сыр»), а сохранённый пример — целое предложение.
 */
function cell(value: string): string {
  const text = value.replace(/\r?\n/g, ' ').trim();
  return /[";,\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Словарь таблицей.
 *
 * Разделитель — точка с запятой: русский Excel по запятой не разбирает вовсе, а
 * Anki разделитель спрашивает. Первая строка — заголовок; Anki просит её
 * пропустить, зато без неё таблица нечитаема глазами.
 */
export function toCsv(rows: readonly ExportRow[]): string {
  const lines = ['слово;перевод;пример;метки'];
  for (const row of rows) {
    lines.push(
      [
        cell(row.word),
        cell(row.translation),
        cell(row.context),
        cell(row.tags.join(' ')),
      ].join(';'),
    );
  }
  // BOM: без него Excel читает кириллицу как «Ð¡Ð»Ð¾Ð²Ð¾».
  return `﻿${lines.join('\r\n')}\r\n`;
}

export interface CardPage {
  /** Лицевая сторона: сербское слово. */
  front: (ExportRow | null)[];
  /** Оборот: перевод, разложенный зеркально по строкам. */
  back: (ExportRow | null)[];
}

/**
 * Раскладка карточек по листам.
 *
 * Оборот зеркалится по строкам, и это единственное, что здесь неочевидно.
 * Двусторонняя печать переворачивает лист по длинному краю, поэтому левый
 * столбец лицевой стороны оказывается напротив ПРАВОГО столбца оборота. Без
 * зеркала перевод печатается не на своём слове, и понять это можно только
 * разрезав лист — то есть слишком поздно.
 *
 * Неполный лист добивается пустыми местами: сетка обязана остаться той же,
 * иначе последний лист разрежется по другим линиям.
 */
export function cardPages(rows: readonly ExportRow[]): CardPage[] {
  const pages: CardPage[] = [];

  for (let start = 0; start < rows.length; start += CARDS_PER_PAGE) {
    const slice = rows.slice(start, start + CARDS_PER_PAGE);
    const front: (ExportRow | null)[] = [];
    for (let i = 0; i < CARDS_PER_PAGE; i++) front.push(slice[i] ?? null);

    const back: (ExportRow | null)[] = [];
    for (let row = 0; row < CARD_ROWS; row++) {
      for (let column = CARD_COLUMNS - 1; column >= 0; column--) {
        back.push(front[row * CARD_COLUMNS + column] ?? null);
      }
    }

    pages.push({ front, back });
  }

  return pages;
}

/** Имя файла с датой: выгрузок со временем накапливается несколько. */
export function exportFileName(extension: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `citavuk-slovar-${stamp}.${extension}`;
}

/** Отдаёт готовый текст файлом. */
export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Ссылка одноразовая, но объект живёт до выгрузки страницы: без отзыва
  // каждая выгрузка оставляла бы в памяти копию словаря.
  URL.revokeObjectURL(url);
}
