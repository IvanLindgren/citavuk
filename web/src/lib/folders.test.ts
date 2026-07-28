import { beforeEach, describe, expect, it } from 'vitest';

import type { BookMeta } from './books';
import {
  addDraftFolder,
  countWithoutFolder,
  foldersOf,
  forgetDraftFolder,
  normalizeFolder,
} from './folders';

function book(folder: string, id = crypto.randomUUID()): BookMeta {
  return {
    id,
    title: 'Књига',
    sourceKey: id,
    folder,
    paragraphCount: 10,
    lastParagraph: 0,
    contentSha: '',
    textMissing: false,
    addedAt: 0,
    updatedAt: 0,
    dirty: 0,
    deleted: 0,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('имя папки', () => {
  it('обрезает края и схлопывает пробелы', () => {
    expect(normalizeFolder('  Учёба   в   Сербии ')).toBe('Учёба в Сербии');
  });

  it('пустое имя остаётся пустым', () => {
    expect(normalizeFolder('   ')).toBe('');
  });

  it('слишком длинное имя укорачивается', () => {
    expect(normalizeFolder('я'.repeat(200))).toHaveLength(60);
  });
});

describe('список папок', () => {
  it('считает книги и сортирует по алфавиту', () => {
    const folders = foldersOf([
      book('Экзамены'),
      book('Биология'),
      book('Экзамены'),
      book(''),
    ]);
    expect(folders.map((folder) => folder.name)).toEqual([
      'Биология',
      'Экзамены',
    ]);
    expect(folders.map((folder) => folder.count)).toEqual([1, 2]);
  });

  it('показывает пустую папку, созданную в этом браузере', () => {
    addDraftFolder('Планы');
    const folders = foldersOf([book('Экзамены')]);
    expect(folders.find((folder) => folder.name === 'Планы')).toEqual({
      name: 'Планы',
      count: 0,
      draft: true,
    });
  });

  it('папка с книгами не считается черновой, даже если её создавали здесь', () => {
    addDraftFolder('Экзамены');
    const folders = foldersOf([book('Экзамены')]);
    expect(folders).toEqual([{ name: 'Экзамены', count: 1, draft: false }]);
  });

  it('забытая черновая папка исчезает из списка', () => {
    addDraftFolder('Планы');
    forgetDraftFolder('Планы');
    expect(foldersOf([])).toEqual([]);
  });

  it('повтор не заводит вторую запись', () => {
    addDraftFolder('Планы');
    addDraftFolder(' Планы ');
    expect(foldersOf([])).toHaveLength(1);
  });

  it('испорченное хранилище не роняет список', () => {
    localStorage.setItem('citavuk-empty-folders', '{не json');
    expect(foldersOf([book('Экзамены')])).toHaveLength(1);
  });
});

describe('книги без папки', () => {
  it('считаются отдельно', () => {
    expect(countWithoutFolder([book(''), book('Экзамены'), book('')])).toBe(2);
  });
});
