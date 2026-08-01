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
