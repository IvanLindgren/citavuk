import { request } from './client';
import type { Study } from './personal';

export interface CaseGameAccess {
  open: boolean;
  publicFrom: string;
  supporter: boolean;
  signedIn: boolean;
}

export interface CaseGameWeak {
  label: string;
  wrong: number;
  total: number;
}

export interface CaseGameResult {
  id: string;
  scope: string;
  limitSeconds: number;
  elapsedSeconds: number;
  words: number;
  correct: number;
  wrong: number;
  diacriticSlips: number;
  chars: number;
  cpm: number;
  accuracy: number;
  weak: CaseGameWeak[];
  createdAt?: string;
}

export function getCaseGameAccess(): Promise<CaseGameAccess> {
  return request<CaseGameAccess>('/v1/games/cases/access');
}

export function saveCaseGameResult(result: CaseGameResult): Promise<{ result: CaseGameResult; study: Study | null }> {
  return request('/v1/games/cases/results', { method: 'POST', body: result });
}

export async function getCaseGameResults(): Promise<CaseGameResult[]> {
  const response = await request<{ results: CaseGameResult[] }>('/v1/games/cases/results');
  return response.results ?? [];
}
