import type { CourseBundle } from '../course/types';
import { request } from './client';

export interface DailyPoint {
  date: string;
  count: number;
}

export interface AdminOverview {
  users: number;
  onlineNow: number;
  active24Hours: number;
  books: number;
  vocabulary: number;
  courseLearners: number;
  publishedCourses: number;
  openIncidents: number;
  newUsers: DailyPoint[];
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  books: number;
  vocabulary: number;
  coursesStarted: number;
}

export interface Incident {
  id: string;
  fingerprint: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  message: string;
  details: Record<string, unknown>;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  resolvedAt: string | null;
}

export interface CourseRelease {
  id: string;
  courseId: string;
  version: string;
  title: string;
  bundle?: CourseBundle;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export const getAdminOverview = () =>
  request<AdminOverview>('/v1/admin/overview');

export const getAdminUsers = (query = '') =>
  request<{ items: AdminUser[] }>(
    `/v1/admin/users?limit=100&q=${encodeURIComponent(query)}`,
  );

export const getIncidents = (all = false) =>
  request<{ items: Incident[] }>(
    `/v1/admin/incidents?limit=100&status=${all ? 'all' : 'open'}`,
  );

export const resolveIncident = (id: string) =>
  request<{ ok: boolean }>(
    `/v1/admin/incidents/${encodeURIComponent(id)}/resolve`,
    { method: 'POST' },
  );

export const getCourseReleases = () =>
  request<{ items: CourseRelease[] }>('/v1/admin/courses');

export const getCourseRelease = (id: string) =>
  request<CourseRelease>(`/v1/admin/courses/${encodeURIComponent(id)}`);

export const createCourseRelease = (bundle: CourseBundle) =>
  request<CourseRelease>('/v1/admin/courses', {
    method: 'POST',
    body: { bundle },
  });

export const updateCourseRelease = (id: string, bundle: CourseBundle) =>
  request<CourseRelease>(`/v1/admin/courses/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { bundle },
  });

export const publishCourseRelease = (id: string) =>
  request<CourseRelease>(
    `/v1/admin/courses/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
  );
