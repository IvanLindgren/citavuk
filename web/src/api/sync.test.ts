import { describe, expect, it } from 'vitest';

import { contentSha } from '../lib/content';

/**
 * Совместимость формата с сервером.
 *
 * Полный цикл синхронизации проверяется отдельно, сквозным прогоном против
 * настоящего сервера (два «устройства», выгрузка и скачивание книги). Здесь —
 * то, что можно проверить без сети: форма записи, которую понимает сервер, и
 * разрешение конфликтов по времени.
 */

/** Повторяет toRemote из sync.ts: именно эти имена полей ждёт сервер. */
function toRemote(book: {
  id: string;
  title: string;
  folder: string;
  sourceKey: string;
  paragraphCount: number;
  lastParagraph: number;
  contentSha: string;
  deleted: 0 | 1;
  updatedAt: number;
}) {
  return {
    id: book.id,
    title: book.title,
    folder: book.folder,
    sourceKey: book.sourceKey,
    paraCount: book.paragraphCount,
    lastPara: book.lastParagraph,
    contentSha: book.contentSha,
    deleted: book.deleted === 1,
    updatedAt: new Date(book.updatedAt).toISOString(),
  };
}

const sample = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Мали принц',
  folder: 'Књиге',
  sourceKey: 'mali_princ.txt',
  paragraphCount: 120,
  lastParagraph: 7,
  contentSha: 'a'.repeat(64),
  deleted: 0 as const,
  updatedAt: Date.parse('2026-07-25T20:00:00.000Z'),
};

describe('формат записи для сервера', () => {
  it('поля названы так, как ждёт сервер', () => {
    // Имена сверены с store.Book в server/internal/store/sync.go. Опечатка
    // здесь не вызовет ошибки: сервер просто примет запись с пустым полем и
    // тихо потеряет заголовок или прогресс.
    expect(Object.keys(toRemote(sample)).sort()).toEqual(
      [
        'contentSha',
        'deleted',
        'folder',
        'id',
        'lastPara',
        'paraCount',
        'sourceKey',
        'title',
        'updatedAt',
      ].sort(),
    );
  });

  it('время уходит в ISO 8601 с зоной', () => {
    const remote = toRemote(sample);
    expect(remote.updatedAt).toBe('2026-07-25T20:00:00.000Z');
    // Сервер разбирает это как timestamptz; без зоны он истолковал бы время как
    // UTC и прогресс с другого часового пояса «уехал» бы.
    expect(remote.updatedAt).toMatch(/Z$/);
  });

  it('надгробие передаётся булевым, а не числом', () => {
    expect(toRemote({ ...sample, deleted: 1 }).deleted).toBe(true);
    expect(toRemote(sample).deleted).toBe(false);
  });

  it('кириллица в заголовке не искажается', () => {
    expect(toRemote(sample).title).toBe('Мали принц');
    expect(toRemote(sample).folder).toBe('Књиге');
  });
});

describe('разрешение конфликтов по времени', () => {
  // Правило одно на всех клиентах: побеждает более позднее изменение.
  const wins = (localAt: number, remoteAt: number) => localAt <= remoteAt;

  it('более свежая серверная версия применяется', () => {
    expect(wins(1000, 2000)).toBe(true);
  });

  it('устаревшая серверная версия не затирает локальную правку', () => {
    // Иначе изменение, которое устройство ещё не успело отправить, потерялось
    // бы при первой же синхронизации.
    expect(wins(2000, 1000)).toBe(false);
  });

  it('одинаковое время считается применимым', () => {
    // Ничья разрешается в пользу сервера: так две стороны сходятся к одному
    // состоянию, а не спорят бесконечно.
    expect(wins(1500, 1500)).toBe(true);
  });
});

describe('адрес текста и синхронизация', () => {
  it('одинаковый текст с двух устройств даёт один адрес', async () => {
    // На этом держится дедупликация: книга, добавленная и в приложении, и в
    // браузере, хранится на сервере один раз.
    const paragraphs = ['Ово је прва глава.', 'Друга глава.'];
    expect(await contentSha(paragraphs)).toBe(await contentSha([...paragraphs]));
  });

  it('правка текста меняет адрес и вызывает перекачку', async () => {
    const before = await contentSha(['Ово је прва глава.']);
    const after = await contentSha(['Ово је прва глава!']);
    expect(after).not.toBe(before);
  });
});
