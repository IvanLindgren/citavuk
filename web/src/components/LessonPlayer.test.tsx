import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../state/sync', () => ({
  useSync: () => ({ sync: vi.fn() }),
}));

import type { Lesson } from '../api/lessons';
import { LessonPlayer } from './LessonPlayer';

const lesson: Lesson = {
  id: 'lesson-1',
  authorId: 'teacher-1',
  authorName: 'Преподаватель',
  slug: 'test-lesson',
  title: 'Тестовый урок',
  summary: 'Короткое описание',
  level: 'A1',
  lessonType: 'grammar',
  topic: 'Падежи',
  tags: [],
  estimatedMinutes: 10,
  script: 'both',
  visibility: 'public',
  revisionId: 'revision-1',
  content: {
    markdown: '## Теория\n\nМатериал урока.',
    theory: [],
    exercises: [
      {
        id: 'one',
        type: 'multiple_choice',
        prompt: 'Первое задание',
        options: ['da', 'ne'],
        answer: 'da',
      },
      {
        id: 'two',
        type: 'fill_blank',
        prompt: 'Второе задание',
        context: 'Ja ___ ovde.',
        answer: 'sam',
      },
    ],
  },
  updatedAt: '2026-08-02T00:00:00Z',
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('scrollTo', vi.fn());
  // jsdom не умеет scrollIntoView, браузеры умеют все. Диалог доводит историю
  // до последней реплики именно им.
  Element.prototype.scrollIntoView = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('урок преподавателя', () => {
  it('сначала показывает теорию, затем по одному заданию', () => {
    act(() => root.render(<LessonPlayer lesson={lesson} />));

    expect(host.textContent).toContain('Материал урока');
    expect(host.textContent).not.toContain('Первое задание');

    click('Перейти к практике');
    expect(heading('Первое задание').closest('[hidden]')).toBeNull();
    expect(heading('Второе задание').closest('[hidden]')).not.toBeNull();

    click('Следующее');
    expect(heading('Первое задание').closest('[hidden]')).not.toBeNull();
    expect(heading('Второе задание').closest('[hidden]')).toBeNull();
  });

  // Со страницы диалогов приходят за разговором. Открывать там теорию и два
  // задания перед ним значит не дать нажавшему то, на что он нажал.
  it('по просьбе открывается сразу диалогом', () => {
    const withDialogue: Lesson = {
      ...lesson,
      content: {
        ...lesson.content!,
        dialogue: {
          startId: 'd1',
          nodes: [
            { id: 'd1', speaker: 'Ana', avatar: 'woman', text: 'Dobar dan!', choices: [] },
          ],
        },
      },
    };
    act(() => root.render(<LessonPlayer lesson={withDialogue} initialStage="dialogue" />));

    expect(host.textContent).toContain('Dobar dan!');
    expect(host.textContent).not.toContain('Материал урока');
    expect(host.textContent).not.toContain('Первое задание');
  });

  // Диалога в уроке может не быть: просьба тогда молча игнорируется, а не
  // оставляет читателя на пустом экране.
  it('без диалога начинает с теории, даже если просили диалог', () => {
    act(() => root.render(<LessonPlayer lesson={lesson} initialStage="dialogue" />));
    expect(host.textContent).toContain('Материал урока');
  });
});

describe('диалог урока', () => {
  const talk: Lesson = {
    ...lesson,
    coverUrl: 'https://example.com/kafana.jpg',
    content: {
      ...lesson.content!,
      dialogue: {
        startId: 'd1',
        nodes: [
          {
            id: 'd1',
            speaker: 'Konobar',
            avatar: 'man',
            text: 'Dobro veče!',
            choices: [
              { label: 'Dobro veče, molim vas jelovnik.', nextId: 'd2' },
              { label: 'Zdravo!', nextId: 'd2' },
            ],
          },
          { id: 'd2', speaker: 'Konobar', avatar: 'man', text: 'Odmah stiže.', choices: [] },
        ],
      },
    },
  };

  const open = (which: Lesson = talk) =>
    act(() => root.render(<LessonPlayer lesson={which} initialStage="dialogue" />));

  // Сказанное должно оставаться на экране: разговор, который нельзя перечитать,
  // ничему не учит. Раньше реплика подменялась следующей.
  it('накапливает разговор, а не подменяет реплику', () => {
    open();
    expect(host.textContent).toContain('Dobro veče!');

    click('1Dobro veče, molim vas jelovnik.');

    expect(host.textContent).toContain('Dobro veče!');
    expect(host.textContent).toContain('Dobro veče, molim vas jelovnik.');
    expect(host.textContent).toContain('Odmah stiže.');
    expect(host.textContent).toContain('Разговор окончен');
  });

  // Поле avatar лежало в данных с самого начала и не показывалось никак.
  it('показывает лицо собеседника по полю avatar', () => {
    open();
    const faces = [...host.querySelectorAll('img')].map((image) => image.getAttribute('src'));
    expect(faces).toContain('/img/face_man.webp');
  });

  // Ответ читателя встаёт справе и со своим лицом: иначе не видно, где чья
  // реплика.
  it('ответ читателя отмечен отдельным лицом', () => {
    open();
    click('1Dobro veče, molim vas jelovnik.');
    const faces = [...host.querySelectorAll('img')].map((image) => image.getAttribute('src'));
    expect(faces).toContain('/img/citavuk_icon.webp');
  });

  it('обложка урока становится сценой разговора', () => {
    open();
    const scene = [...host.querySelectorAll('img')].map((image) => image.getAttribute('src'));
    expect(scene).toContain('https://example.com/kafana.jpg');
  });

  // У уроков, написанных до появления выбора персонажа, поля avatar нет. Лицо
  // тогда берётся по имени — устойчиво, чтобы два собеседника не оказались на
  // вид одним человеком.
  it('без avatar даёт разным говорящим разные лица', () => {
    const old = {
      ...talk,
      content: {
        ...talk.content!,
        dialogue: {
          startId: 'd1',
          nodes: [
            {
              id: 'd1',
              speaker: 'Ana',
              text: 'Zdravo!',
              choices: [{ label: 'Zdravo.', nextId: 'd2' }],
            },
            { id: 'd2', speaker: 'Marko', text: 'Ćao.', choices: [] },
          ] as never,
        },
      },
    } as Lesson;
    open(old);
    click('1Zdravo.');
    const faces = new Set(
      [...host.querySelectorAll('img')]
        .map((image) => image.getAttribute('src') ?? '')
        .filter((source) => source.startsWith('/img/face_')),
    );
    expect(faces.size).toBe(2);
  });
});

function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Не найдена кнопка: ${label}`);
  act(() => button.click());
}

function heading(text: string) {
  const result = [...host.querySelectorAll('h3')].find(
    (item) => item.textContent === text,
  );
  if (!result) throw new Error(`Не найден заголовок: ${text}`);
  return result;
}
