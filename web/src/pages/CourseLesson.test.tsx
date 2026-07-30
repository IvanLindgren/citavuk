import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Урок курса открывается целиком, а не по частям.
 *
 * Проверка появилась после жалоб на «чёрный экран» вместо урока «Две азбуки».
 * Ошибка в отрисовке роняет всё дерево React, и вместо страницы остаётся пустой
 * фон — ни сообщения, ни следа в интерфейсе. Отдельные тесты на блоки теории и
 * упражнения такого не находят: там каждая часть проверяется в одиночку, а
 * падало на сборке страницы.
 */

const auth = vi.hoisted(() => ({
  account: null as null | { id: string },
}));
vi.mock('../state/auth', () => ({
  useAuth: () => ({ account: auth.account }),
}));
vi.mock('../state/sync', () => ({
  useSync: () => ({ sync: vi.fn(), revision: 0 }),
}));
vi.mock('../lib/seo', () => ({
  useSeo: () => undefined,
}));

const params: { id: string } = { id: 'l_pismo_1' };
const router = vi.hoisted(() => ({
  navigate: vi.fn(),
  back: vi.fn(),
}));
vi.mock('../lib/router', () => ({
  useParams: () => params,
  useRouter: () => ({
    path: '/course/lesson/l_pismo_1',
    navigate: router.navigate,
    back: router.back,
  }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const bundleText = readFileSync(
  '../frontend/assets/course/course_bundle.json',
  'utf8',
);

import { CourseLesson } from './CourseLesson';
import type { CourseBundle } from '../course/types';

const bundle = JSON.parse(bundleText) as CourseBundle;

let host: HTMLDivElement;
let errors: unknown[] = [];

beforeEach(() => {
  errors = [];
  auth.account = null;
  localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value: vi.fn(),
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('course_bundle.json')) {
        return new Response(bundleText, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Сервер отдаёт 204, пока свой вариант курса не опубликован, — так же,
      // как на citavuk.ru. Клиент обязан в этом случае взять файл из сборки.
      return new Response(null, { status: 204 });
    }),
  );
});

afterEach(() => {
  host.remove();
  vi.unstubAllGlobals();
});

async function open(lessonId: string, signedIn = false): Promise<string> {
  params.id = lessonId;
  auth.account = signedIn ? { id: 'test-user' } : null;
  const root = createRoot(host, {
    onUncaughtError: (error) => errors.push(error),
    onCaughtError: (error) => errors.push(error),
  });
  await act(async () => {
    root.render(<CourseLesson />);
  });
  // Курс подгружается асинхронно: даём промисам завершиться.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const html = host.innerHTML;
  act(() => root.unmount());
  return html;
}

describe('страница урока', () => {
  it('первый урок про азбуки открывается и показывает теорию', async () => {
    const html = await open('l_pismo_1');

    expect(errors).toEqual([]);
    expect(html).not.toBe('');
    expect(html).toContain('Две азбуки');
  });

  it('первый урок открывается у вошедшего пользователя', async () => {
    const html = await open('l_pismo_1', true);

    expect(errors).toEqual([]);
    expect(html).toContain('Две азбуки');
    expect(html).toContain('Начать');
  });

  it('открывается каждый урок курса', async () => {
    const broken: string[] = [];
    const lessons = bundle.units.flatMap((unit) =>
      unit.skills.flatMap((skill) => skill.lessons),
    );

    for (const lesson of lessons) {
      errors = [];
      const html = await open(lesson.id);
      if (errors.length > 0) {
        broken.push(`${lesson.id}: ${String(errors[0])}`);
      } else if (html.trim() === '') {
        broken.push(`${lesson.id}: пустая страница`);
      }
    }

    expect(broken).toEqual([]);
  });
});
