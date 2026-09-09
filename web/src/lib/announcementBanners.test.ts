import { describe, expect, it } from 'vitest';

import type { Announcement } from '../api/announcements';
import { pickBanners } from './announcementBanners';

function item(id: string, patch: Partial<Announcement> = {}): Announcement {
  return {
    id,
    status: 'published',
    kind: 'news',
    title: id,
    body: 'тело',
    bannerText: '',
    imageUrl: '',
    actionLabel: '',
    actionUrl: '',
    startsAt: null,
    endsAt: null,
    bannerEnabled: true,
    notifyUsers: false,
    shareRequired: false,
    shareText: '',
    rewardKey: '',
    rewardAssetUrl: '',
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...patch,
  };
}

describe('pickBanners', () => {
  it('без объявлений баннеров нет', () => {
    expect(pickBanners([], []).banners).toEqual([]);
  });

  it('из обычных выбирается одно: кампания важнее новости', () => {
    const { banners } = pickBanners(
      [item('news', { kind: 'news' }), item('sale', { kind: 'campaign' })], []);
    expect(banners.map((entry) => entry.id)).toEqual(['sale']);
  });

  it('критическое сервисное идёт отдельно и первым', () => {
    const { banners, rest } = pickBanners(
      [item('news', { kind: 'news' }), item('works', { kind: 'maintenance' })], []);
    expect(banners.map((entry) => entry.id)).toEqual(['works', 'news']);
    expect(rest).toEqual([]);
  });

  it('закрытые и небannerные не показываются, остальные — в rest', () => {
    const { banners, rest } = pickBanners([
      item('closed', { dismissedAt: '2026-01-02T00:00:00Z' }),
      item('quiet', { bannerEnabled: false }),
      item('guest-closed', {}),
      item('open'),
    ], ['guest-closed']);
    expect(banners.map((entry) => entry.id)).toEqual(['open']);
    expect(rest).toEqual([]);
  });

  it('лишние обычные уходят в rest для центра уведомлений', () => {
    const { banners, rest } = pickBanners(
      [item('a', { kind: 'news' }), item('b', { kind: 'news' })], []);
    expect(banners).toHaveLength(1);
    expect(rest.map((entry) => entry.id)).toEqual(['b']);
  });
});
