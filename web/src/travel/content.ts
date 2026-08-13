import { toLatin } from '../lib/tokenize';
import type { PlaceContent, PlaceKind, TravelBundle } from './types';

/**
 * Справочник Путешествия: типы мест, города и всё, что в них говорят.
 *
 * Файл собирается из `frontend/assets/travel/` скриптом подготовки ассетов, а
 * не запрашивается по кусочкам: тридцать три запроса на открытие карты — это
 * тридцать три повода не открыться.
 */

const URL = '/travel/bundle.json';

let pending: Promise<TravelBundle> | null = null;

export function loadTravel(): Promise<TravelBundle> {
  pending ??= fetch(URL)
    .then((response) => {
      if (!response.ok) throw new Error(`travel bundle ${response.status}`);
      return response.json() as Promise<TravelBundle>;
    })
    .catch((error: unknown) => {
      // Иначе неудачная загрузка запомнилась бы навсегда и раздел не ожил бы
      // даже после возвращения сети.
      pending = null;
      throw error;
    });
  return pending;
}

/**
 * Тип для места, которого Читавук не знает: слова и фразы, нужные в любом
 * заведении. Лучше, чем «не разглядел» в ответ на нажатие.
 */
export const ANYWHERE = 'anywhere';

export function kindById(bundle: TravelBundle, id: string): PlaceKind | null {
  return bundle.kinds.find((kind) => kind.id === id) ?? null;
}

export function contentOf(bundle: TravelBundle, id: string): PlaceContent | null {
  return bundle.places[id] ?? null;
}

export type Script = 'cyrillic' | 'latin';

const SCRIPT_KEY = 'citavuk-travel-script';

export function readScript(): Script {
  try {
    return localStorage.getItem(SCRIPT_KEY) === 'latin' ? 'latin' : 'cyrillic';
  } catch {
    return 'cyrillic';
  }
}

export function saveScript(script: Script): void {
  try {
    localStorage.setItem(SCRIPT_KEY, script);
  } catch {
    // Приватный режим: выбор проживёт до перезагрузки вкладки.
  }
}

/** Сербский текст в выбранной графике. Хранится всё кириллицей. */
export function inScript(text: string, script: Script): string {
  return script === 'latin' ? toLatin(text) : text;
}
