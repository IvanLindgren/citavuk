import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  claimAnnouncement as claimOnServer,
  dismissAnnouncement as dismissOnServer,
  getAnnouncements,
  getNotifications,
  readAllNotifications as readAllOnServer,
  readAnnouncement as readOnServer,
  readNotification as readNotificationOnServer,
  type Announcement,
  type UserNotification,
} from '../api/announcements';
import { useAuth } from './auth';

interface AnnouncementValue {
  announcements: Announcement[];
  notifications: UserNotification[];
  unread: number;
  activeBanner: Announcement | null;
  selected: Announcement | null;
  centerOpen: boolean;
  rewards: Record<string, string>;
  select: (announcement: Announcement | null) => void;
  setCenterOpen: (open: boolean) => void;
  dismiss: (announcement: Announcement) => Promise<void>;
  claim: (announcement: Announcement, network: string, proofUrl: string) => Promise<void>;
  openNotification: (notification: UserNotification) => Promise<void>;
  readAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AnnouncementContext = createContext<AnnouncementValue | null>(null);
const GUEST_DISMISSED = 'citavuk-dismissed-announcements';

function guestDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(GUEST_DISMISSED) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const { account, loading } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [selected, select] = useState<Announcement | null>(null);
  const [centerOpen, setCenterOpen] = useState(false);

  const refresh = useCallback(async () => {
    const nextAnnouncements = await getAnnouncements();
    setAnnouncements(nextAnnouncements);
    if (account) {
      const nextNotifications = await getNotifications();
      setNotifications(nextNotifications.items ?? []);
      setUnread(nextNotifications.unread ?? 0);
    } else {
      setNotifications([]);
      setUnread(0);
    }
  }, [account]);

  useEffect(() => {
    if (loading) return;
    void refresh().catch(() => undefined);
  }, [loading, refresh]);

  const selectAnnouncement = useCallback((announcement: Announcement | null) => {
    select(announcement);
    if (!announcement || !account || announcement.readAt) return;
    void readOnServer(announcement.id).catch(() => undefined);
    setAnnouncements((items) => items.map((item) =>
      item.id === announcement.id ? { ...item, readAt: new Date().toISOString() } : item));
  }, [account]);

  const dismiss = useCallback(async (announcement: Announcement) => {
    if (account) {
      await dismissOnServer(announcement.id);
    } else {
      const ids = new Set(guestDismissed());
      ids.add(announcement.id);
      try { localStorage.setItem(GUEST_DISMISSED, JSON.stringify([...ids])); } catch { /* noop */ }
    }
    setAnnouncements((items) => items.map((item) =>
      item.id === announcement.id ? { ...item, dismissedAt: new Date().toISOString() } : item));
    if (selected?.id === announcement.id) selectAnnouncement(null);
  }, [account, selected, selectAnnouncement]);

  const claim = useCallback(async (announcement: Announcement, network: string, proofUrl: string) => {
    if (!account) throw new Error('Чтобы получить фон, войдите в аккаунт.');
    await claimOnServer(announcement.id, network, proofUrl);
    await refresh();
  }, [account, refresh]);

  const openNotification = useCallback(async (notification: UserNotification) => {
    if (!notification.readAt) {
      await readNotificationOnServer(notification.id);
      setNotifications((items) => items.map((item) =>
        item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      setUnread((value) => Math.max(0, value - 1));
    }
    const announcement = announcements.find((item) =>
      item.title === notification.title && notification.kind === 'announcement');
    if (announcement) selectAnnouncement(announcement);
    else if (notification.targetUrl) location.assign(notification.targetUrl);
    setCenterOpen(false);
  }, [announcements, selectAnnouncement]);

  const readAll = useCallback(async () => {
    if (!account) return;
    await readAllOnServer();
    const now = new Date().toISOString();
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    setUnread(0);
  }, [account]);

  const dismissedGuests = account ? [] : guestDismissed();
  const activeBanner = announcements.find((item) =>
    item.bannerEnabled && !item.dismissedAt && !dismissedGuests.includes(item.id)) ?? null;
  const rewards = Object.fromEntries(announcements
    .filter((item) => item.claimedAt && item.rewardKey && item.rewardAssetUrl)
    .map((item) => [item.rewardKey, item.rewardAssetUrl]));

  const value = useMemo<AnnouncementValue>(() => ({
    announcements, notifications, unread, activeBanner, selected, centerOpen, rewards,
    select: selectAnnouncement, setCenterOpen, dismiss, claim, openNotification, readAll, refresh,
  }), [announcements, notifications, unread, activeBanner, selected, centerOpen, rewards,
    selectAnnouncement, dismiss, claim, openNotification, readAll, refresh]);

  return <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>;
}

export function useAnnouncements(): AnnouncementValue {
  const value = useContext(AnnouncementContext);
  if (!value) throw new Error('useAnnouncements вызван вне AnnouncementProvider');
  return value;
}
