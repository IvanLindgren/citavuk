import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExerciseView, IntroBlockView, initialDraft } from '../pages/CourseLesson';
import type { CourseBundle, CourseLesson, Exercise, IntroBlock } from './types';

/**
 * Каждый блок теории и каждое упражнение курса должны отрисовываться.
 *
 * Проверка ради одного случая: урок «Две азбуки» открывался чёрным экраном.
 * Ошибка в отрисовке роняет всё дерево React, и вместо урока остаётся пустая
 * страница — без сообщения, без следа в интерфейсе. Отдельные тесты на типы
 * упражнений такое не ловят: падало на настоящем содержимом курса, а не на
 * придуманном в тесте. Поэтому здесь берётся ровно тот файл, который уходит на
 * сайт, и прогоняется целиком.
 */

const bundle: CourseBundle = JSON.parse(
  readFileSync('../frontend/assets/course/course_bundle.json', 'utf8'),
) as CourseBundle;

function lessons(course: CourseBundle): CourseLesson[] {
  return course.units.flatMap((unit) =>
    unit.skills.flatMap((skill) => skill.lessons),
  );
}

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => host.remove());

function draw(node: React.ReactNode): void {
  const root = createRoot(host);
  act(() => root.render(node));
  act(() => root.unmount());
}

describe('содержимое курса отрисовывается', () => {
  const all = lessons(bundle);

  it('курс не пустой', () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it('все блоки теории', () => {
    const broken: string[] = [];
    for (const lesson of all) {
      for (const [index, block] of (lesson.intro?.blocks ?? []).entries()) {
        try {
          draw(<IntroBlockView block={block as IntroBlock} />);
        } catch (error) {
          broken.push(
            `${lesson.id} блок ${index} (${block.kind}): ${String(error)}`,
          );
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('все упражнения', () => {
    const broken: string[] = [];
    for (const lesson of all) {
      for (const exercise of lesson.exercises as Exercise[]) {
        try {
          draw(
            <ExerciseView
              exercise={exercise}
              draft={initialDraft(exercise)}
              disabled={false}
              shuffleSeed="seed"
              onChange={() => undefined}
            />,
          );
        } catch (error) {
          broken.push(`${lesson.id} / ${exercise.id} (${exercise.type}): ${String(error)}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
