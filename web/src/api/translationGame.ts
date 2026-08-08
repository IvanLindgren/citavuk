import { request } from './client';

export type TranslationGameLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type TranslationGameProvider = 'deepl' | 'google';
export type TranslationGameWinner = 'user' | 'translator' | 'tie';

export interface TranslationGameSentence {
  id: string;
  text: string;
  translatorTranslation: string;
}
export interface TranslationGameRound {
  level: TranslationGameLevel;
  round: number;
  translator: TranslationGameProvider;
  sentences: TranslationGameSentence[];
  judgeEnabled: boolean;
}

export interface TranslationGameEntry {
  source: string;
  userTranslation: string;
  translatorTranslation: string;
}

export interface TranslationGameVerdict {
  index: number;
  winner: TranslationGameWinner;
  userScore: number;
  translatorScore: number;
  feedback: string;
}

export interface TranslationGameJudgement {
  verdicts: TranslationGameVerdict[];
  summary: string;
}

export function loadTranslationGameRound(
  level: TranslationGameLevel,
  round: number,
  translator: TranslationGameProvider,
): Promise<TranslationGameRound> {
  return request<TranslationGameRound>('/v1/translation-game/round', {
    method: 'POST',
    body: { level, round, translator },
    timeoutMs: 45_000,
  });
}

export function judgeTranslationGameRound(
  entries: TranslationGameEntry[],
): Promise<TranslationGameJudgement> {
  return request<TranslationGameJudgement>('/v1/translation-game/judge', {
    method: 'POST',
    body: { entries },
    timeoutMs: 100_000,
  });
}
