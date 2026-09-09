import type { Announcement } from '../api/announcements';

/**
 * Выбор баннеров к показу — зеркало `pickBanners` во Flutter
 * (`frontend/lib/models/server_announcement.dart`): критическое сервисное
 * отдельно плюс максимум одно обычное (кампания важнее новости).
 */
export function pickBanners(
  announcements: Announcement[],
  guestDismissedIds: string[],
): { banners: Announcement[]; rest: Announcement[] } {
  const visible = announcements.filter((item) =>
    item.bannerEnabled && !item.dismissedAt && !guestDismissedIds.includes(item.id));
  const critical = visible.find((item) => item.kind === 'maintenance') ?? null;
  const ordinary = visible
    .filter((item) => item.kind !== 'maintenance')
    .sort((a, b) => priorityOf(a) - priorityOf(b))[0] ?? null;
  const banners = [critical, ordinary].filter(
    (item): item is Announcement => item !== null);
  const shown = new Set(banners);
  return { banners, rest: visible.filter((item) => !shown.has(item)) };
}

function priorityOf(item: Announcement): number {
  return item.kind === 'campaign' ? 1 : 2;
}
