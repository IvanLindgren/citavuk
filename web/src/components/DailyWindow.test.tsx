import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DailyState } from '../api/daily';

const SET: DailyState = {
  set: {
    id: 'd1',
    day: '2026-08-15',
    level: 'A2',
    words: [
      {
        lemma: 'бурек',
        translation: 'бурек',
        theme: 'Еда',
        example: 'Купујем *бурек* сваког јутра.',
        exampleTranslation: 'Покупаю бурек каждое утро.',
      },
      { lemma: 'пекара', translation: 'пекарня', theme: 'Еда' },
    ],
    lesson: {
      title: 'Јутро',
      text: 'Ана иде у пекару и купује бурек.',
      exercises: [
        {
          kind: 'choice',
          question: 'Куда иде Ана?',
          options: ['у пекару', 'у школу'],
          answer: 'у пекару',
        },
      ],
    },
    learned: [],
  },
  level: 'A2',
  themes: ['Еда'],
  enabled: true,
  configured: true,
  progress: {
    reviewedToday: 4,
    dueNow: 2,
    words: 120,
    strong: 30,
    faded: [{ word: 'кашика', translation: 'ложка', overdueDays: 9 }],
    streak: 3,
  },
  lessonReady: true,
  canCompose: true,
};

const loadDaily = vi.fn(async () => SET);
const markDailyLearned = vi.fn(async () => ({ learned: ['бурек'] }));
const saveVocabularyWord = vi.fn(async () => ({}));

vi.mock('../api/daily', () => ({
  loadDaily: (...args: unknown[]) => loadDaily(...(args as [])),
  loadDailySettings: vi.fn(async () => ({
    themes: [],
    enabled: true,
    level: '',
    configured: false,
    available: [{ theme: 'Еда', words: 40 }],
  })),
  saveDailySettings: vi.fn(async () => ({ themes: ['Еда'], enabled: true })),
  composeDailyLesson: vi.fn(),
  markDailyLearned: (...args: unknown[]) => markDailyLearned(...(args as [])),
  loadDailyProgress: vi.fn(),
}));

vi.mock('../lib/vocabulary', () => ({
  saveVocabularyWord: (...args: unknown[]) => saveVocabularyWord(...(args as [])),
}));

vi.mock('../state/sync', () => ({
  useSync: () => ({ sync: vi.fn() }),
}));

import { DailyButton } from './DailyWindow';

function byText(text: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('button, p, h2, h3, span')).find(
    (element) => element.textContent?.trim() === text,
  );
}

describe('окно «На каждый день»', () => {
  let host: HTMLElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  async function open() {
    const root = createRoot(host);
    await act(async () => {
      root.render(<DailyButton />);
    });
    await act(async () => {
      host.querySelector('button')?.click();
    });
    return root;
  }

  it('показывает слова дня, сводку и забытое', async () => {
    await open();

    expect(document.body.textContent).toContain('бурек');
    expect(document.body.textContent).toContain('пекарня');
    // Пример показывается без звёздочек разметки.
    expect(document.body.textContent).toContain('Купујем бурек сваког јутра.');
    expect(document.body.textContent).not.toContain('*бурек*');
    expect(document.body.textContent).toContain('3 дн. подряд');
    expect(document.body.textContent).toContain('кашика');
  });

  // Кнопка «плюс» и кладёт слово в карточки, и отмечает его в наборе: иначе
  // назавтра оно вернулось бы как невыученное.
  it('добавляет слово в карточки и отмечает его выученным', async () => {
    await open();

    const add = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Добавить в карточки"]',
    );
    expect(add).toBeTruthy();

    await act(async () => {
      add?.click();
    });

    expect(saveVocabularyWord).toHaveBeenCalledTimes(1);
    expect(saveVocabularyWord).toHaveBeenCalledWith(
      expect.objectContaining({
        lemma: 'бурек',
        translation: 'бурек',
        forms: expect.objectContaining({
          контекст: 'Купујем бурек сваког јутра.',
        }),
      }),
    );
    expect(markDailyLearned).toHaveBeenCalledWith('бурек');
    // Повторное нажатие невозможно: кнопка стала отметкой «уже в карточках».
    expect(
      document.querySelector('button[aria-label="Уже в карточках"]'),
    ).toBeTruthy();
  });

  // Ошибиться в упражнении можно, но человек должен увидеть верный ответ:
  // задание без разбора ничему не учит.
  it('после неверного варианта показывает правильный ответ', async () => {
    await open();

    await act(async () => {
      byText('у школу')?.click();
    });

    expect(document.body.textContent).toContain('Правильный ответ:');
    expect(document.body.textContent).toContain('у пекару');
    // Второй попытки нет — иначе счётчик верных ответов ничего не значит.
    expect(byText('у школу')?.hasAttribute('disabled')).toBe(true);
  });
});
