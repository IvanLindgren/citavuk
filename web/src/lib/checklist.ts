import { useEffect, useState } from 'react';

import { activeStorageName } from './db';

/**
 * Чек-лист дня: урок курса, слова дня, ролик, новость или свой текст.
 *
 * Включается по желанию и живёт в браузере: это личная привычка на этом
 * устройстве, а не данные, которые нужно переносить между телефоном и сайтом.
 * Отметки за день сбрасываются сами — ключом служит дата.
 */

export type ChecklistItem = 'lesson' | 'words' | 'video' | 'read';

export const CHECKLIST_ITEMS: ChecklistItem[] = ['lesson', 'words', 'video', 'read'];

export interface ChecklistState {
  enabled: boolean;
  interests: string[];
  day: string;
  done: Partial<Record<ChecklistItem, boolean>>;
  /** Ролик дня: выбирается один раз, чтобы не менялся при каждом заходе. */
  video: string;
  /** Дни, когда закрыты все пункты: полоска недели и серия. */
  history: string[];
}

const EVENT = 'citavuk:checklist';

function storageKey(): string {
  return `citavuk-checklist:${activeStorageName()}`;
}

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function today(): string {
  return dayKey(new Date());
}

function blank(): ChecklistState {
  return { enabled: false, interests: [], day: today(), done: {}, video: '', history: [] };
}

export function readChecklist(): ChecklistState {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Partial<ChecklistState>;
    const state: ChecklistState = {
      ...blank(),
      enabled: parsed.enabled === true,
      interests: Array.isArray(parsed.interests) ? parsed.interests.filter((item) => typeof item === 'string').slice(0, 20) : [],
      history: Array.isArray(parsed.history) ? parsed.history.filter((item) => typeof item === 'string').slice(-60) : [],
    };
    if (parsed.day === state.day) {
      state.done = parsed.done && typeof parsed.done === 'object' ? parsed.done : {};
      state.video = typeof parsed.video === 'string' ? parsed.video : '';
    }
    return state;
  } catch {
    return blank();
  }
}

function write(state: ChecklistState): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch {
    // Приватный режим: отметки проживут до закрытия вкладки.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function updateChecklist(change: (state: ChecklistState) => ChecklistState): ChecklistState {
  const next = change(readChecklist());
  write(next);
  return next;
}

/** Отметить пункт выполненным. Работает и при выключенном чек-листе: включив
 * его вечером, человек увидит то, что уже сделал днём. */
export function markChecklist(item: ChecklistItem, value = true): void {
  updateChecklist((state) => {
    if (Boolean(state.done[item]) === value) return state;
    const done = { ...state.done, [item]: value };
    const full = CHECKLIST_ITEMS.every((key) => done[key]);
    const history = full
      ? [...state.history.filter((day) => day !== state.day), state.day].slice(-60)
      : state.history.filter((day) => day !== state.day);
    return { ...state, done, history };
  });
}

/** Сколько дней подряд закрыт весь список, считая сегодня или вчера. */
export function checklistStreak(history: string[], now = new Date()): number {
  const days = new Set(history);
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function checklistEnabled(): boolean {
  return readChecklist().enabled;
}

export function useChecklist(): ChecklistState {
  const [state, setState] = useState(readChecklist);
  useEffect(() => {
    const refresh = () => setState(readChecklist());
    window.addEventListener(EVENT, refresh);
    window.addEventListener('storage', refresh);
    // День сменился, пока вкладка была открыта, — отметки сбрасываются.
    const timer = window.setInterval(() => {
      if (readChecklist().day !== state.day) refresh();
    }, 60_000);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.clearInterval(timer);
    };
  }, [state.day]);
  return state;
}
