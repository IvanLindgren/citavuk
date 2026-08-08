import { request } from './client';

export interface ProfileStats {
  words: { added: number; learned: number; due: number };
  activity: Array<{ day: string; added: number; reviewed: number }>;
  streakDays: number;
  goal: { target: string; done: number; total: number; ratio: number };
  achievements: Array<{
    key: string;
    title: string;
    description: string;
    icon: string;
    unlockedAt?: string;
  }>;
}

export function getProfileStats() {
  return request<ProfileStats>('/v1/profile/stats');
}
