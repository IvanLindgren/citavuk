import { request } from './client';

export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type AnnouncementKind = 'news' | 'campaign' | 'maintenance';

export interface Announcement {
  id: string;
  status: AnnouncementStatus;
  kind: AnnouncementKind;
  title: string;
  body: string;
  bannerText: string;
  imageUrl: string;
  actionLabel: string;
  actionUrl: string;
  startsAt: string | null;
  endsAt: string | null;
  bannerEnabled: boolean;
  notifyUsers: boolean;
  shareRequired: boolean;
  shareText: string;
  rewardKey: string;
  rewardAssetUrl: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readAt?: string | null;
  dismissedAt?: string | null;
  claimedAt?: string | null;
  socialNetwork?: string;
  proofUrl?: string;
  claimCount?: number;
}

export interface AnnouncementDraft {
  kind: AnnouncementKind;
  title: string;
  body: string;
  bannerText: string;
  imageUrl: string;
  actionLabel: string;
  actionUrl: string;
  startsAt: string | null;
  endsAt: string | null;
  bannerEnabled: boolean;
  notifyUsers: boolean;
  shareRequired: boolean;
  shareText: string;
  rewardKey: string;
  rewardAssetUrl: string;
}

export interface UserNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  targetUrl: string;
  readAt: string | null;
  createdAt: string;
}

export const getAnnouncements = async () =>
  (await request<{ items: Announcement[] }>('/v1/announcements')).items;

export const readAnnouncement = (id: string) =>
  request<void>(`/v1/announcements/${encodeURIComponent(id)}/read`, { method: 'POST' });

export const dismissAnnouncement = (id: string) =>
  request<void>(`/v1/announcements/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });

export const claimAnnouncement = (id: string, socialNetwork: string, proofUrl: string) =>
  request<{ rewardKey: string; rewardAssetUrl: string }>(
    `/v1/announcements/${encodeURIComponent(id)}/claim`,
    { method: 'POST', body: { socialNetwork, proofUrl } },
  );

export const getNotifications = () =>
  request<{ items: UserNotification[]; unread: number }>('/v1/notifications?limit=50');

export const readNotification = (id: string) =>
  request<void>(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });

export const readAllNotifications = () =>
  request<void>('/v1/notifications/read-all', { method: 'POST' });

export const getAdminAnnouncements = async () =>
  (await request<{ items: Announcement[] }>('/v1/admin/announcements')).items;

export const createAnnouncement = (body: AnnouncementDraft) =>
  request<Announcement>('/v1/admin/announcements', { method: 'POST', body });

export const updateAnnouncement = (id: string, body: AnnouncementDraft) =>
  request<Announcement>(`/v1/admin/announcements/${encodeURIComponent(id)}`, {
    method: 'PUT', body,
  });

export const publishAnnouncement = (id: string) =>
  request<Announcement>(`/v1/admin/announcements/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
  });

export const archiveAnnouncement = (id: string) =>
  request<void>(`/v1/admin/announcements/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
  });
