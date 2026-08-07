import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PUBLISHED = {
  id: 'a1',
  kind: 'news',
  title: 'Старое объявление',
  body: 'Текст старого',
  bannerText: 'Коротко',
  imageUrl: '',
  actionLabel: '',
  actionUrl: '',
  startsAt: null,
  endsAt: null,
  bannerEnabled: true,
  notifyUsers: true,
  shareRequired: false,
  shareText: '',
  rewardKey: '',
  rewardAssetUrl: '',
  status: 'published',
  claimCount: 0,
};

vi.mock('../api/announcements', () => ({
  getAdminAnnouncements: vi.fn(async () => [PUBLISHED]),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  publishAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
}));

import { AdminAnnouncementsPanel } from './AdminAnnouncementsPanel';

function fields(host: HTMLElement) {
  return {
    title: host.querySelector<HTMLInputElement>('input[type="text"], input:not([type])'),
    body: host.querySelector<HTMLTextAreaElement>('textarea'),
    fieldset: host.querySelector<HTMLFieldSetElement>('fieldset'),
  };
}

describe('панель объявлений', () => {
  let host: HTMLElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  // Нажатие «Новое объявление» сбрасывало выбор, из-за этого перезагружался
  // список — и подставлял обратно последнее объявление. Опубликованное вдобавок
  // блокирует поля, поэтому выглядело так, будто форма вообще не открывается.
  it('«Новое объявление» очищает форму и не подставляет прежнее', async () => {
    const root = createRoot(host);
    await act(async () => {
      root.render(<AdminAnnouncementsPanel />);
    });

    // Панель открылась на существующем объявлении, и оно опубликовано.
    expect(fields(host).title?.value).toBe('Старое объявление');
    expect(fields(host).fieldset?.disabled).toBe(true);

    const newButton = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Новое объявление'),
    );
    expect(newButton).toBeTruthy();

    await act(async () => {
      newButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(fields(host).title?.value).toBe('');
    expect(fields(host).body?.value).toBe('');
    expect(fields(host).fieldset?.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  // Полей у объявления полтора десятка, а чаще всего нужно просто разослать
  // уведомление: всё лишнее скрыто, пока его не попросят.
  it('прячет настройки баннера и награды, пока их не раскроют', async () => {
    const root = createRoot(host);
    await act(async () => {
      root.render(<AdminAnnouncementsPanel />);
    });

    expect(host.textContent).not.toContain('Иллюстрация');
    expect(host.textContent).not.toContain('Ключ награды');

    const toggle = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Баннер, картинка'),
    );
    expect(toggle).toBeTruthy();

    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('Иллюстрация');

    await act(async () => root.unmount());
  });
});
