/**
 * Матч «Ты против переводчика» на несколько человек.
 *
 * Живого канала нет: комната опрашивается обычным GET раз в пару секунд. Всё,
 * что должно случиться само — кончился раунд, никто не пришёл, пора судить, —
 * сервер делает в момент опроса.
 *
 * Гость играет по ссылке без аккаунта, поэтому у него есть своя подпись
 * участника: сервер выдаёт её при входе, браузер хранит и отправляет обратно.
 * Без подписи гость был бы для комнаты новым человеком после каждой
 * перезагрузки страницы.
 */

import { request } from './client';
import type { TranslationGameDirection, TranslationGameLevel, TranslationGameProvider } from './translationGame';

export type DuelPhase = 'lobby' | 'translate' | 'judging' | 'vote' | 'result' | 'finished';

export interface DuelPlayer {
  id: string;
  name: string;
  machine?: TranslationGameProvider;
  host: boolean;
  joined: boolean;
  ready: boolean;
  left: boolean;
  score: number;
  you?: boolean;
  /** Сколько фраз раунда переведено. Текста тут нет — только число. */
  progress?: number;
  /** Отдал все свои голоса. */
  voted?: boolean;
}

export interface DuelSentence {
  id: string;
  text: string;
}

/** Перевод на голосовании — без автора. */
export interface DuelBallotOption {
  alias: string;
  text: string;
}

export interface DuelBallotSentence {
  sentenceId: string;
  text: string;
  options: DuelBallotOption[];
}

export interface DuelRevealAnswer {
  playerId: string;
  name: string;
  machine?: TranslationGameProvider;
  text: string;
  score?: number;
  won: boolean;
  you?: boolean;
}

export interface DuelRevealSentence {
  sentenceId: string;
  text: string;
  answers: DuelRevealAnswer[];
  feedback?: string;
}

export interface DuelStanding {
  id: string;
  name: string;
  score: number;
  place: number;
  machine?: TranslationGameProvider;
}

export interface DuelRoom {
  code: string;
  level: TranslationGameLevel;
  direction: TranslationGameDirection;
  seats: number;
  open: boolean;
  matched: boolean;
  phase: DuelPhase;
  round: number;
  rounds: number;
  /** Идентификатор того, кто смотрит. Пусто у постороннего. */
  you: string;
  host: boolean;
  players: DuelPlayer[];
  sentences?: DuelSentence[];
  /** Свои переводы и свои голоса. Чужих здесь не бывает. */
  answers?: Record<string, string>;
  votes?: Record<string, string>;
  ballot?: DuelBallotSentence[];
  reveal?: DuelRevealSentence[];
  summary?: string;
  standings?: DuelStanding[];
  deadline?: string;
  /** Часы сервера: остаток времени считается от них, а не от часов браузера. */
  now: string;
}

export interface DuelQueueState {
  waiting: boolean;
  since?: string;
  seats?: number;
  /** Ожидание затянулось: пора предложить сыграть с машиной. */
  ripe: boolean;
  /** Код найденной комнаты. */
  room?: string;
  searching: number;
  now: string;
}

interface RoomAnswer {
  room: DuelRoom;
  token?: string;
}

const PLAYER_KEY = 'citavuk-duel-player';
const PLAYER_NAME_KEY = 'citavuk-duel-player-name';

export function duelPlayerToken(): string {
  try {
    return localStorage.getItem(PLAYER_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberPlayer(token?: string): void {
  if (!token) return;
  try {
    localStorage.setItem(PLAYER_KEY, token);
  } catch {
    // Приватный режим: подпись проживёт до перезагрузки вкладки.
  }
}

export function duelPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberPlayerName(name?: string): void {
  const clean = name?.trim();
  if (!clean) return;
  try {
    localStorage.setItem(PLAYER_NAME_KEY, clean);
  } catch {
    // Имя можно снова ввести после перезагрузки приватной вкладки.
  }
}

function headers(): Record<string, string> {
  const token = duelPlayerToken();
  return token ? { 'X-Duel-Player': token } : {};
}

async function room<T extends RoomAnswer>(path: string, options: Parameters<typeof request>[1] = {}): Promise<DuelRoom> {
  const answer = await request<T>(path, { ...options, headers: headers() });
  rememberPlayer(answer.token);
  return answer.room;
}

export interface DuelRoomSettings {
  level: TranslationGameLevel;
  direction: TranslationGameDirection;
  seats: number;
  name?: string;
  open?: boolean;
}

export function createDuelRoom(settings: DuelRoomSettings): Promise<DuelRoom> {
  rememberPlayerName(settings.name);
  return room('/v1/duel/rooms', { method: 'POST', body: settings });
}

export function joinDuelRoom(code: string, name?: string): Promise<DuelRoom> {
  rememberPlayerName(name);
  return room(`/v1/duel/rooms/${code}/join`, { method: 'POST', body: { name } });
}

export function getDuelRoom(code: string, signal?: AbortSignal): Promise<DuelRoom> {
  return room(`/v1/duel/rooms/${code}`, { signal });
}

export function addDuelMachine(code: string, provider: TranslationGameProvider): Promise<DuelRoom> {
  return room(`/v1/duel/rooms/${code}/machine`, { method: 'POST', body: { provider } });
}

export function startDuelMatch(code: string): Promise<DuelRoom> {
  // Начало раунда переводит фразы для машин за столом, поэтому ждём дольше.
  return room(`/v1/duel/rooms/${code}/start`, { method: 'POST', timeoutMs: 45_000 });
}

export function sendDuelAnswer(code: string, sentenceId: string, text: string): Promise<DuelRoom> {
  return room(`/v1/duel/rooms/${code}/answer`, { method: 'POST', body: { sentenceId, text } });
}

/**
 * Черновик всего раунда разом.
 *
 * Уходит сам, пока человек печатает: переводы, отправленные только по кнопке
 * «Сдать», пропадали целиком у того, кто не успел нажать до звонка.
 */
export function saveDuelDraft(code: string, answers: Record<string, string>): Promise<DuelRoom> {
  return room(`/v1/duel/rooms/${code}/answers`, { method: 'POST', body: { answers } });
}

export function readyDuel(code: string): Promise<DuelRoom> {
  return room(`/v1/duel/rooms/${code}/ready`, { method: 'POST' });
}

export function voteDuel(code: string, sentenceId: string, alias: string): Promise<DuelRoom> {
  return room(`/v1/duel/rooms/${code}/vote`, { method: 'POST', body: { sentenceId, alias } });
}

export function leaveDuelRoom(code: string): Promise<DuelRoom> {
  return room(`/v1/duel/rooms/${code}/leave`, { method: 'POST' });
}

async function queue(path: string, options: Parameters<typeof request>[1] = {}): Promise<DuelQueueState> {
  const answer = await request<DuelQueueState & { token?: string }>(path, { ...options, headers: headers() });
  rememberPlayer(answer.token);
  return answer;
}

export interface DuelSearchSettings {
  level: TranslationGameLevel;
  direction: TranslationGameDirection;
  seats: number;
  name?: string;
}

export function enterDuelQueue(settings: DuelSearchSettings): Promise<DuelQueueState> {
  rememberPlayerName(settings.name);
  return queue('/v1/duel/queue', { method: 'POST', body: settings });
}

export function getDuelQueue(signal?: AbortSignal): Promise<DuelQueueState> {
  return queue('/v1/duel/queue', { signal });
}

export function leaveDuelQueue(): Promise<DuelQueueState> {
  return queue('/v1/duel/queue', { method: 'DELETE' });
}
