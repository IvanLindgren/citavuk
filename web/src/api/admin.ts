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

/** Состояние ключей и квот: что настроено и сколько осталось. */
export interface AdminKey {
  name: string;
  title: string;
  ready: boolean;
  note?: string;
}

export interface AdminQuota {
  provider: string;
  used: number;
  limit: number;
  dailyBudget: number;
  dailyRemaining: number;
  budgetEnabled: boolean;
  error?: string;
}

export interface AdminHealth {
  version: string;
  uptime: number;
  database: boolean;
  quota: AdminQuota;
  keys: AdminKey[];
  now: string;
}

export interface LivePlayer {
  name: string;
  machine?: string;
  host?: boolean;
  score: number;
  ready?: boolean;
  left?: boolean;
  answers: number;
  account?: boolean;
  seenAgo: number;
}

export interface LiveRoom {
  code: string;
  phase: string;
  level: string;
  direction: string;
  seats: number;
  round: number;
  open: boolean;
  matched: boolean;
  people: number;
  machines: number;
  players: LivePlayer[];
  sentences: number;
  createdAt: string;
  updatedAt: string;
}

export interface LiveWaiting {
  name: string;
  level: string;
  direction: string;
  seats: number;
  account?: boolean;
  since: string;
  seen: string;
  room?: string;
}

export interface LiveDuel {
  rooms: LiveRoom[];
  queue: LiveWaiting[];
  people: number;
  roomsToday: number;
}

export interface StatsWindow {
  day: number;
  week: number;
  month: number;
  total: number;
}

export interface SectionUse {
  section: string;
  title: string;
  people: number;
}

export interface AdminStats {
  users: StatsWindow;
  active: StatsWindow;
  books: StatsWindow;
  vocabulary: StatsWindow;
  duels: StatsWindow;
  lessons: StatsWindow;
  quizzes: StatsWindow;
  documents: StatsWindow;
  documentChars: StatsWindow;
  newUsers: DailyPoint[];
  activeByDay: DailyPoint[];
  sections: SectionUse[];
  translationCache: number;
  openIncidents: number;
  incidentsToday: number;
}

export interface ErrorEvent {
  at: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  user?: string;
  message?: string;
}

export interface ErrorPath {
  path: string;
  method: string;
  count: number;
  worst: number;
  last?: string;
}

export interface IncidentFacet {
  value: string;
  count: number;
}

export interface IncidentFilter {
  all?: boolean;
  severity?: string;
  source?: string;
  query?: string;
  hours?: number;
}

export const getAdminOverview = () =>
  request<AdminOverview>('/v1/admin/overview');

export const getAdminHealth = () => request<AdminHealth>('/v1/admin/health');

export const getLiveDuel = () => request<LiveDuel>('/v1/admin/duel/live');

export const getAdminStats = () => request<AdminStats>('/v1/admin/stats');

export const getRecentErrors = () =>
  request<{ items: ErrorEvent[]; paths: ErrorPath[] }>('/v1/admin/errors?limit=150');

export const resolveIncidentsBySource = (source: string) =>
  request<{ closed: number }>(
    `/v1/admin/incidents/resolve-source?source=${encodeURIComponent(source)}`,
    { method: 'POST' },
  );

export const getAdminUsers = (query = '') =>
  request<{ items: AdminUser[] }>(
    `/v1/admin/users?limit=100&q=${encodeURIComponent(query)}`,
  );

export const getIncidents = (filter: IncidentFilter = {}) => {
  const params = new URLSearchParams({
    limit: '150',
    status: filter.all ? 'all' : 'open',
  });
  if (filter.severity) params.set('severity', filter.severity);
  if (filter.source) params.set('source', filter.source);
  if (filter.query) params.set('q', filter.query);
  if (filter.hours) params.set('hours', String(filter.hours));
  return request<{ items: Incident[]; facets: Record<string, IncidentFacet[]> }>(
    `/v1/admin/incidents?${params.toString()}`,
  );
};

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
