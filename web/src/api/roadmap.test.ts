import { afterEach, describe, expect, it, vi } from 'vitest';

import { setToken } from './client';
import {
  loadRoadmap,
  loadRoadmapSection,
  levelPassed,
  nextLevel,
  type RoadmapCategory,
  type RoadmapLevelView,
  type RoadmapProgress,
} from './roadmap';

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

it('загружает карту с токеном, чтобы цель и прогресс не пропали', async () => {
  setToken('roadmap-session');
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    levels: [], categories: [], target: 'B1', current: 'A2',
    passingScore: 0.8, signedIn: true,
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  await loadRoadmap();

  const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect((options.headers as Record<string, string>).Authorization)
    .toBe('Bearer roadmap-session');
});

it('нормализует пустой раздел со старого сервера', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    level: 'A1',
    category: { key: 'reading', title: 'Reading', local: 'Čitanje', about: '' },
    intro: '',
    items: null,
    exercises: null,
    words: null,
    progress: { done: 0, total: 0, ratio: 0, passed: false },
  }), { status: 200 })));

  const section = await loadRoadmapSection('A1', 'reading');

  expect(section.items).toEqual([]);
  expect(section.exercises).toEqual([]);
  expect(section.words).toEqual([]);
});

const progress = (done: number, total: number): RoadmapProgress => ({
  done,
  total,
  ratio: total === 0 ? 0 : done / total,
  passed: total > 0 && done / total >= 0.8,
});

const categories: RoadmapCategory[] = [
  { key: 'reading', title: 'Reading', local: 'Čitanje', about: '' },
  { key: 'grammar', title: 'Grammar', local: 'Gramatika', about: '' },
  { key: 'vocabulary', title: 'Vocabulary', local: 'Vokabular', about: '' },
  { key: 'writing', title: 'Writing', local: 'Pisanje', about: '' },
];

const level = (
  byCategory: Record<string, RoadmapProgress>,
): RoadmapLevelView => ({
  level: 'B1',
  name: 'Читаю с переводчиком',
  categories: byCategory,
  passed: false,
});

describe('уровень дорожной карты', () => {
  it('засчитывается по всем четырём разделам', () => {
    const view = level({
      reading: progress(9, 10),
      grammar: progress(8, 10),
      vocabulary: progress(90, 100),
      writing: progress(8, 10),
    });
    expect(levelPassed(view, categories)).toBe(true);
  });

  it('не засчитывается, если один раздел ниже порога', () => {
    const view = level({
      reading: progress(9, 10),
      grammar: progress(5, 10),
      vocabulary: progress(90, 100),
      writing: progress(9, 10),
    });
    expect(levelPassed(view, categories)).toBe(false);
  });

  // Ненаполненный уровень не должен открывать дорогу дальше сам собой.
  it('не засчитывается, если раздел пуст', () => {
    const view = level({
      reading: progress(9, 10),
      grammar: progress(0, 0),
      vocabulary: progress(90, 100),
      writing: progress(9, 10),
    });
    expect(levelPassed(view, categories)).toBe(false);
  });

  it('не засчитывается на пустой карте', () => {
    expect(levelPassed(level({}), categories)).toBe(false);
  });
});

describe('следующая ступень', () => {
  it('идёт по шкале', () => {
    expect(nextLevel('A1')).toBe('A2');
    expect(nextLevel('B2')).toBe('C1');
  });

  // С вершины шкалы идти некуда, и предлагать переход нельзя.
  it('пуста на вершине и на мусоре', () => {
    expect(nextLevel('C2')).toBe('');
    expect(nextLevel('чепуха')).toBe('');
  });
});
