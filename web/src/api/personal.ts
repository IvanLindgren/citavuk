import { request } from "./client";
import {acceptStudy} from '../lib/study';
import {activeStorageName} from '../lib/db';
import type { DailyExercise } from "./daily";

export interface Study {
  asOf?:string;
  timezone: string;
  current: number;
  longest: number;
  freezes: number;
  activeDays: number;
  todayActive: boolean;
  today: string;
  newDay: boolean;
  days: { date: string; kind: "active" | "frozen" }[];
}
export interface PersonalProfile {
  level: string;
  timezone: string;
  answers: Record<string, string>;
}
export interface Question {
  id: string;
  title: string;
  options: string[];
  multiple?: boolean;
  exclusive?: string;
}
export interface LessonContent {
  title: string;
  kind: string;
  theme: string;
  text: string;
  rules: string[];
  scheme: { title: string; columns: string[]; rows: string[][] };
  exercises: DailyExercise[];
}
export interface PersonalCard {
  day: number;
  revision: number;
  edited: boolean;
  completedAt?: string;
  score?: number;
  total?: number;
  rating: number;
  unlocked: boolean;
}
export interface PersonalLesson extends PersonalCard {
  content: LessonContent;
}
export interface PersonalPlan {
  id: string;
  profile: PersonalProfile;
  outline: { day: number; title: string; kind: string; goal: string }[];
  startedAt: string;
  status: string;
  generation: number;
  regenerations: number;
  error?: string;
  today: number;
  month: number;
  lessons: PersonalCard[];
  suggestRegeneration: boolean;
}
export interface PersonalState {
  history?: { id: string; startedAt: string; level: string }[];
  available: boolean;
  questions: Question[];
  plan: PersonalPlan | null;
}
export interface PersonalResult {
  score: number;
  total: number;
  completed: boolean;
  study: Study;
}
const base = (id: string, day?: number) =>
  `/v1/personal/${encodeURIComponent(id)}${day === undefined ? "" : `/days/${day}`}`;
export const personalApi = {
  latest: (signal?: AbortSignal) =>
    request<PersonalState>("/v1/personal", { signal }),
  create: (body: PersonalProfile) =>
    request<{ id: string }>("/v1/personal", { method: "POST", body }),
  plan: (id: string, signal?: AbortSignal) =>
    request<PersonalPlan>(base(id), { signal }),
  lesson: (id: string, day: number, signal?: AbortSignal) =>
    request<PersonalLesson>(base(id, day), { signal }),
  edit: (id: string, day: number, revision: number, content: LessonContent) =>
    request(base(id, day), { method: "PUT", body: { revision, content } }),
  complete: async (id: string, day: number, revision: number, answers: string[]) => {
    const owner=activeStorageName();
    const result=await request<PersonalResult>(`${base(id, day)}/complete`, {
      method: "POST",
      body: { revision, answers },
    });
    acceptStudy(result.study,owner,true);return result;
  },
  rate: (id: string, day: number, rating: number) =>
    request(`${base(id, day)}/rating`, { method: "PUT", body: { rating } }),
  regenerate: (id: string, feedback: string) =>
    request(`${base(id)}/regenerate`, { method: "POST", body: { feedback } }),
  retry: (id: string) => request(`${base(id)}/retry`, { method: "POST" }),
  study: (signal?: AbortSignal) => request<Study>("/v1/study", { signal }),
};
