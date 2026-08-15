import type { GardenEarning, GardenState } from '../api/garden';

/**
 * Прилетевшие динары.
 *
 * Начисления считает сервер, и приходят они молча: человек читал книгу, потом
 * зашёл в сад — а там просто число в углу стало больше. За что именно, видно
 * только в отдельном окне «Заработок», куда никто не заглядывает.
 *
 * Здесь запоминается, сколько сегодня уже пришло из каждого источника, и при
 * следующем ответе сервера считается разница. Она и есть повод сказать
 * «+3 динара — за чтение».
 */

export interface Earned {
  /** Источник: он же ключ, по которому ищется прошлое значение. */
  source: string;
  title: string;
  coins: number;
}

/** Сколько динаров пришло сегодня из каждого источника. */
export type Ledger = Record<string, number>;

const KEY = 'citavuk-garden-earned';

export function ledgerOf(earnings: GardenEarning[]): Ledger {
  const ledger: Ledger = {};
  for (const line of earnings) ledger[line.source] = line.today;
  return ledger;
}

/**
 * Что прибавилось с прошлого раза.
 *
 * Уменьшение — это не убыток, а новый день: счётчики источников каждую полночь
 * начинаются заново, и говорить об этом человеку нечего.
 */
export function arrived(before: Ledger, earnings: GardenEarning[]): Earned[] {
  const notes: Earned[] = [];
  for (const line of earnings) {
    const grew = line.today - (before[line.source] ?? 0);
    if (grew > 0) notes.push({ source: line.source, title: line.title, coins: grew });
  }
  return notes;
}

export function readLedger(): Ledger | null {
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved ? (JSON.parse(saved) as Ledger) : null;
  } catch {
    return null;
  }
}

export function saveLedger(ledger: Ledger): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ledger));
  } catch {
    // Приватный режим: без памяти о прошлом ответе просто не будет записок.
  }
}

/**
 * Разница между прошлым ответом сервера и нынешним.
 *
 * Первый заход молчит намеренно: сравнивать не с чем, и человек получил бы
 * пачку записок обо всём, что заработал за день до открытия сада.
 */
export function coinsArrived(state: GardenState): Earned[] {
  const before = readLedger();
  saveLedger(ledgerOf(state.earnings));
  return before ? arrived(before, state.earnings) : [];
}
