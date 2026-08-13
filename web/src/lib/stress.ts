import { useEffect, useState } from 'react';

import { toLatin } from './tokenize';

/**
 * Ударения прямо в тексте книги.
 *
 * Место ударения в сербском по написанию не восстанавливается, поэтому нужен
 * словарь. Таблицу собирает `web/scripts/build-stress-marks.py` из лексикона
 * сервера (данные Викисловаря, CC BY-SA 4.0) и кладёт в `/reader/stress.txt`
 * строками «словоформа → номер ударного слога».
 *
 * Номер слога, а не готовая разметка: он одинаково работает для латиницы и
 * кириллицы, а в тексте книга встречается и такой, и такой.
 */

const URL = '/reader/stress.txt';

/** Комбинируемый знак, который удаляем из выделения старой разметки. */
export const STRESS_MARK = '\u0301';

export type StressTable = Map<string, number>;

const VOWELS = 'aeiouаеиоу';
const RHOTIC = 'rр';

/**
 * Индексы слоговых вершин слова.
 *
 * Вершина — гласная либо слоговое «r» между согласными («prst», «крв»): без
 * второго правила такие слова выглядели бы вовсе без слогов.
 */
export function syllableNuclei(word: string): number[] {
  const letters = [...word.toLocaleLowerCase('sr')];
  const vowel = (index: number) => {
    const letter = letters[index];
    return letter !== undefined && VOWELS.includes(letter);
  };

  const out: number[] = [];
  for (let index = 0; index < letters.length; index += 1) {
    const letter = letters[index]!;
    if (VOWELS.includes(letter)) {
      out.push(index);
      continue;
    }
    if (!RHOTIC.includes(letter)) continue;
    if (!vowel(index - 1) && !vowel(index + 1)) out.push(index);
  }
  return out;
}

/**
 * Какую букву слова выделить. `null` — ударение неизвестно.
 *
 * Слова нет в таблице — работает правило: в сербском ударение никогда не падает
 * на последний слог, значит в одно- и двусложном слове оно на первом. В словах
 * длиннее оно может стоять где угодно, кроме последнего слога, и там помета не
 * ставится: пустое место честнее уверенной ошибки.
 *
 * Возвращается номер буквы среди кодовых точек, а не байтовое смещение: слово
 * приходит из текста как есть, и разрезать его нужно ровно по этой букве.
 */
export function stressIndex(word: string, table: StressTable | null): number | null {
  const nuclei = syllableNuclei(word);
  if (nuclei.length === 0) return null;

  const key = toLatin(word).toLocaleLowerCase('sr');
  const known = table?.get(key);
  const at = known ?? (nuclei.length <= 2 ? 1 : 0);
  if (at < 1 || at > nuclei.length) return null;
  // Односложное слово подсвечивать незачем: выбора всё равно нет.
  if (nuclei.length < 2) return null;
  return nuclei[at - 1] ?? null;
}

export function parseStressTable(text: string): StressTable {
  const table: StressTable = new Map();
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 1) continue;
    const at = Number(line.slice(tab + 1));
    if (!Number.isInteger(at) || at < 1) continue;
    table.set(line.slice(0, tab), at);
  }
  return table;
}

let pending: Promise<StressTable> | null = null;

/**
 * Таблица для читалки. `null`, пока не загрузилась или пока помета выключена:
 * текст показывается сразу, ударения проступают, когда словарь доедет.
 */
export function useStressTable(enabled: boolean): StressTable | null {
  const [table, setTable] = useState<StressTable | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadStressTable().then(
      (loaded) => {
        if (alive) setTable(loaded);
      },
      () => {
        // Без словаря читалка работает как раньше — молча, без ошибки на весь
        // экран: человек пришёл читать книгу, а не чинить словарь.
      },
    );
    return () => {
      alive = false;
    };
  }, [enabled]);

  return enabled ? table : null;
}

/** Таблица целиком. Полмегабайта текста, поэтому грузится по требованию. */
export function loadStressTable(): Promise<StressTable> {
  pending ??= fetch(URL)
    .then((response) => {
      if (!response.ok) throw new Error(`stress table ${response.status}`);
      return response.text();
    })
    .then(parseStressTable)
    .catch((error: unknown) => {
      // Иначе неудачная загрузка запомнилась бы навсегда, и ударения не
      // появились бы даже после возвращения сети.
      pending = null;
      throw error;
    });
  return pending;
}
