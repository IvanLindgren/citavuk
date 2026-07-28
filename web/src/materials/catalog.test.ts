import { describe, expect, it } from 'vitest';

import {
  DOCUMENTS,
  LEVELS,
  SOURCES,
  SUBJECTS,
  YEARS,
  filterDocuments,
  formatBytes,
  subjectsForLevel,
} from './catalog';

/**
 * Каталог собирается скриптом и лежит в репозитории готовым. Тесты сторожат не
 * содержание (оно меняется с каждой пересборкой), а обещания, на которые
 * опирается интерфейс: уникальные ключи, живые ссылки в схеме, честные счётчики
 * у фильтров. Счётчик, обещающий 69 документов и находящий ноль, читается как
 * сломанный фильтр.
 */
describe('каталог материалов', () => {
  it('не пуст и содержит оба уровня поступления', () => {
    expect(DOCUMENTS.length).toBeGreaterThan(0);
    expect(SUBJECTS.length).toBeGreaterThan(0);
    expect(SOURCES.length).toBeGreaterThan(0);
    expect(LEVELS.map((level) => level.id).sort()).toEqual([
      'fakultet',
      'gimnazija',
    ]);
  });

  it('ключи документов уникальны', () => {
    const ids = new Set(DOCUMENTS.map((document) => document.id));
    expect(ids.size).toBe(DOCUMENTS.length);
  });

  it('у каждого документа есть ссылка, источник и допустимый вид', () => {
    for (const document of DOCUMENTS) {
      expect(document.url, document.title).toMatch(/^https?:\/\//);
      expect(document.publisher, document.url).not.toBe('');
      expect(['test', 'key', 'guide', 'book']).toContain(document.kindId);
      expect(['gimnazija', 'fakultet']).toContain(document.level);
    }
  });

  it('годы перечислены от новых к старым и без пустых значений', () => {
    expect(YEARS.length).toBeGreaterThan(0);
    expect([...YEARS].sort((a, b) => b - a)).toEqual(YEARS);
    expect(YEARS.every((year) => Number.isInteger(year))).toBe(true);
  });

  it('фильтр по уровню разбивает каталог без потерь', () => {
    const school = filterDocuments({
      level: 'gimnazija',
      subjectId: null,
      year: null,
      kindId: null,
      query: '',
    });
    const faculty = filterDocuments({
      level: 'fakultet',
      subjectId: null,
      year: null,
      kindId: null,
      query: '',
    });

    expect(school.length).toBeGreaterThan(0);
    expect(faculty.length).toBeGreaterThan(0);
    expect(school.length + faculty.length).toBe(DOCUMENTS.length);
  });

  it('счётчики предметов совпадают с тем, что находит фильтр', () => {
    for (const level of ['gimnazija', 'fakultet'] as const) {
      for (const subject of subjectsForLevel(level)) {
        const found = filterDocuments({
          level,
          subjectId: subject.id,
          year: null,
          kindId: null,
          query: '',
        });
        expect(found.length, `${subject.title} · ${level}`).toBe(subject.count);
      }
    }
  });

  it('без уровня предметы не фильтруются', () => {
    expect(subjectsForLevel(null)).toBe(SUBJECTS);
  });

  it('поиск ищет и по учреждению', () => {
    const found = filterDocuments({
      level: null,
      subjectId: null,
      year: null,
      kindId: null,
      query: 'матфак',
    });
    expect(found.length).toBeGreaterThan(0);
  });

  it('размер показывается по-человечески', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(240 * 1024)).toBe('240 КБ');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3,5 МБ');
  });
});
