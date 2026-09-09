import { expect, it } from 'vitest';
import { latestStudy, studyMonth } from './studyCalendar';
import type { Study } from '../api/personal';

it('расставляет даты с понедельника, включая високосный февраль и границу года', () => {
  expect(studyMonth('2024-03-01', -1)).toMatchObject({ key: '2024-02', padding: 3 });
  expect(studyMonth('2024-03-01', -1)?.days).toHaveLength(29);
  expect(studyMonth('2026-01-01', -1)?.key).toBe('2025-12');
  expect(studyMonth('2026-09-09')?.days[8]).toBe('2026-09-09');
  expect(studyMonth('broken')).toBeNull();
});

it('старый кеш не отменяет более свежую статистику профиля', () => {
  const initial = { current: 3, asOf: '2026-09-09T12:00:00Z' } as Study;
  const live = { current: 1, asOf: '2026-09-09T11:00:00Z' } as Study;
  expect(latestStudy(initial, live)?.current).toBe(3);
  expect(latestStudy(initial, { ...live, current: 4, asOf: '2026-09-09T13:00:00Z' })?.current).toBe(4);
});
