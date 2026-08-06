import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LessonExercise } from '../api/lessons';
import { LessonExerciseEditor } from './LessonExerciseEditor';

/**
 * Отметка правильного варианта. Оба случая ниже преподаватель описывал одним
 * словом — «лагает»: в первом нажатие не делало ничего, во втором снимало
 * отметку в соседнем вопросе.
 */

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(exercises: LessonExercise[], onChange = vi.fn()) {
  act(() => root.render(<LessonExerciseEditor exercises={exercises} onChange={onChange} />));
  return onChange;
}

function radios(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
}

describe('отметка правильного варианта', () => {
  // Новое задание начинается с двух ПУСТЫХ вариантов. Пока отметка искалась
  // сравнением текста, пустой вариант отметить было нельзя вовсе: нажатие не
  // делало ничего, пока преподаватель не наберёт текст.
  it('пустой вариант можно отметить сразу', () => {
    const onChange = render([
      { id: 'a', type: 'multiple_choice', prompt: 'Вопрос', options: ['', ''], answer: '' },
    ]);

    const second = radios()[1]!;
    act(() => second.click());

    expect(radios()[1]!.checked).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  // Два одинаковых варианта по тексту неразличимы, и раньше зажигались обе
  // точки разом.
  it('одинаковые по тексту варианты различаются', () => {
    render([
      { id: 'a', type: 'multiple_choice', prompt: 'Вопрос', options: ['da', 'da'], answer: 'da' },
    ]);

    act(() => radios()[1]!.click());
    const checked = radios().filter((radio) => radio.checked);
    expect(checked).toHaveLength(1);
  });

  // Группа радиокнопок называлась по подписи списка, а в «тексте и вопросах»
  // подпись у всех одна — «Ответы». Все вопросы урока оказывались одной
  // группой: отметка во втором вопросе снимала отметку в первом.
  it('вопросы одного задания не делят одну группу', () => {
    render([
      {
        id: 'a',
        type: 'reading_qa',
        prompt: 'Прочитайте',
        readingText: 'Tekst.',
        questions: [
          { id: 'q1', prompt: 'Первый', options: ['da', 'ne'], answer: 'da' },
          { id: 'q2', prompt: 'Второй', options: ['da', 'ne'], answer: 'ne' },
        ],
      },
    ]);

    const names = new Set(radios().map((radio) => radio.name));
    expect(radios()).toHaveLength(4);
    expect(names.size).toBe(2);

    // Отметка во втором вопросе не трогает первый.
    act(() => radios()[3]!.click());
    expect(radios()[0]!.checked).toBe(true);
    expect(radios()[3]!.checked).toBe(true);
  });

  it('два задания подряд тоже не делят группу', () => {
    render([
      { id: 'a', type: 'multiple_choice', prompt: 'Первый', options: ['da', 'ne'], answer: 'da' },
      { id: 'b', type: 'multiple_choice', prompt: 'Второй', options: ['da', 'ne'], answer: 'ne' },
    ]);

    const names = new Set(radios().map((radio) => radio.name));
    expect(names.size).toBe(2);
  });

  it('подпись объясняет, что точка отмечает верный вариант', () => {
    render([
      { id: 'a', type: 'multiple_choice', prompt: 'Вопрос', options: ['da', 'ne'], answer: 'da' },
    ]);
    expect(host.textContent).toContain('Точкой слева отмечается правильный вариант.');
    expect(host.textContent).toContain('верный');
  });
});
