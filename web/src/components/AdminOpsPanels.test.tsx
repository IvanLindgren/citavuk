import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  health: vi.fn(), live: vi.fn(), stats: vi.fn(), errors: vi.fn(), incidents: vi.fn(),
}));

vi.mock('../api/admin', async (original) => {
  const actual = await original<typeof import('../api/admin')>();
  return {
    ...actual,
    getAdminHealth: mocks.health,
    getLiveDuel: mocks.live,
    getAdminStats: mocks.stats,
    getRecentErrors: mocks.errors,
    getIncidents: mocks.incidents,
  };
});

import { AdminErrorsPanel, AdminKeysPanel, AdminLivePanel, AdminStatsPanel } from './AdminOpsPanels';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** Числа Intl разделяет неразрывным пробелом — в проверках он мешает. */
function plain(text: string | null): string {
  return (text ?? '').replace(/ /g, ' ');
}

async function draw(node: React.ReactNode) {
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  await act(async () => { await Promise.resolve(); });
}

describe('ключи и лимиты', () => {
  it('показывает остаток квоты DeepL и суточный бюджет', async () => {
    mocks.health.mockResolvedValue({
      version: '1.2.3', uptime: 7300, database: true,
      quota: {
        provider: 'deepl', used: 400_000, limit: 500_000,
        dailyBudget: 16_129, dailyRemaining: 4_000, budgetEnabled: true,
      },
      keys: [
        { name: 'deepl', title: 'DeepL — перевод', ready: true },
        { name: 'mail', title: 'Почта (Resend)', ready: false },
      ],
      now: '2026-08-15T12:00:00Z',
    });

    await draw(<AdminKeysPanel />);
    const text = plain(host.textContent);

    expect(text).toContain('осталось 100 000 знаков');
    expect(text).toContain('80%');
    // Ключ без настройки видно сразу, а не после чтения журнала.
    expect(text).toContain('не настроен');
    expect(text).toContain('2 ч 1 мин');
  });

  it('не падает, когда провайдер не ответил', async () => {
    mocks.health.mockResolvedValue({
      version: 'dev', uptime: 30, database: true,
      quota: {
        provider: 'deepl', used: 0, limit: 0, dailyBudget: 0,
        dailyRemaining: 0, budgetEnabled: false, error: 'DeepL /usage: 403 Forbidden',
      },
      keys: [],
      now: '2026-08-15T12:00:00Z',
    });

    await draw(<AdminKeysPanel />);
    expect(plain(host.textContent)).toContain('403 Forbidden');
    expect(plain(host.textContent)).toContain('выключен');
  });
});

describe('кто играет', () => {
  it('показывает комнату, игроков и очередь', async () => {
    mocks.live.mockResolvedValue({
      people: 2, roomsToday: 11,
      rooms: [{
        code: 'QWERTY', phase: 'translate', level: 'B1', direction: 'sr-ru',
        seats: 3, round: 2, open: false, matched: true, people: 2, machines: 1,
        sentences: 5,
        players: [
          { name: 'Маша', score: 7, answers: 3, seenAgo: 2, account: true },
          { name: 'DeepL', machine: 'deepl', score: 5, answers: 5, seenAgo: 0 },
          { name: 'Гость', score: 0, answers: 0, seenAgo: 200, left: true },
        ],
        createdAt: '2026-08-15T12:00:00Z', updatedAt: '2026-08-15T12:03:00Z',
      }],
      queue: [{
        name: 'Петя', level: 'A2', direction: 'ru-sr', seats: 2,
        since: '2026-08-15T12:02:00Z', seen: '2026-08-15T12:03:00Z',
      }],
    });

    await draw(<AdminLivePanel />);
    const text = plain(host.textContent);

    expect(text).toContain('QWERTY');
    expect(text).toContain('Раунд');
    expect(text).toContain('Маша');
    // Прогресс соседа — то же число, что видно за столом.
    expect(text).toContain('3/5');
    expect(text).toContain('ушёл');
    expect(text).toContain('Петя');
  });

  it('говорит прямо, когда никто не играет', async () => {
    mocks.live.mockResolvedValue({ people: 0, roomsToday: 0, rooms: [], queue: [] });
    await draw(<AdminLivePanel />);
    expect(plain(host.textContent)).toContain('Сейчас никто не играет');
    expect(plain(host.textContent)).toContain('Очередь пуста');
  });
});

describe('ошибки', () => {
  it('журнал показывает запись с числом повторов', async () => {
    mocks.incidents.mockResolvedValue({
      items: [{
        id: 'i1', fingerprint: 'log:судья', severity: 'error', source: 'server',
        message: 'судья матча не ответил: 429 Too Many Requests',
        details: { err: '429', code: 'ABCDEF' },
        occurrences: 12, firstSeen: '2026-08-15T10:00:00Z',
        lastSeen: '2026-08-15T12:00:00Z', resolvedAt: null,
      }],
      facets: { severity: [{ value: 'error', count: 1 }], source: [{ value: 'server', count: 1 }] },
    });

    await draw(<AdminErrorsPanel />);
    const text = plain(host.textContent);

    expect(text).toContain('судья матча не ответил');
    expect(text).toContain('12 раз');
    // Отбор по источнику и важности — с числами, чтобы видеть, где горит.
    expect(text).toContain('server · 1');
  });

  it('живой список считает самые шумные ручки', async () => {
    mocks.errors.mockResolvedValue({
      items: [
        { at: '2026-08-15T12:00:00Z', method: 'POST', path: '/v1/duel/rooms', status: 429, ms: 3, message: 'Слишком часто.' },
      ],
      paths: [{ method: 'POST', path: '/v1/duel/rooms', count: 9, worst: 429, last: 'Слишком часто.' }],
    });

    await draw(<AdminErrorsPanel />);
    const tab = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Свежие отказы'));
    await act(async () => { tab?.click(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    const text = plain(host.textContent);
    expect(text).toContain('/v1/duel/rooms');
    expect(text).toContain('429');
    expect(text).toContain('Слишком часто.');
  });
});

describe('статистика', () => {
  it('показывает окна и разделы', async () => {
    mocks.stats.mockResolvedValue({
      users: { day: 3, week: 12, month: 40, total: 900 },
      active: { day: 20, week: 60, month: 150, total: 800 },
      books: { day: 1, week: 2, month: 3, total: 4 },
      vocabulary: { day: 5, week: 6, month: 7, total: 8 },
      duels: { day: 9, week: 10, month: 11, total: 12 },
      lessons: { day: 0, week: 0, month: 0, total: 0 },
      quizzes: { day: 0, week: 0, month: 0, total: 0 },
      documents: { day: 0, week: 0, month: 0, total: 0 },
      documentChars: { day: 1234, week: 0, month: 0, total: 0 },
      newUsers: [{ date: '2026-08-14', count: 2 }, { date: '2026-08-15', count: 3 }],
      activeByDay: [{ date: '2026-08-14', count: 12 }, { date: '2026-08-15', count: 20 }],
      sections: [{ section: 'reader', title: 'Читалка', people: 34 }],
      translationCache: 5000, openIncidents: 2, incidentsToday: 1,
    });

    await draw(<AdminStatsPanel />);
    const text = plain(host.textContent);

    expect(text).toContain('Матчи перевода');
    expect(text).toContain('Читалка');
    expect(text).toContain('Новые пользователи');
    // Числа с разделителем: 1234 знака читаются как «1 234».
    expect(text).toContain('1 234');
  });
});
