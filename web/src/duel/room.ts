/**
 * Разбор состояния комнаты матча.
 *
 * Вынесено из страницы, потому что это её проверяемая часть: остаток времени
 * считается по часам сервера, а не браузера, опрос идёт с разной частотой в
 * разных фазах, и «кто ещё пишет» — не то же самое, что «кто сидит за столом».
 */

import type { DuelPhase, DuelPlayer, DuelQueueState, DuelRoom, DuelStanding } from '../api/duel';
import { plural } from '../lib/books';

/**
 * Сколько секунд осталось в фазе.
 *
 * Часы браузера врут: у кого-то они отстают на минуты, а раунд идёт три с
 * половиной. Поэтому сервер присылает своё время вместе с комнатой, и остаток
 * считается от него плюс то, что прошло на странице с момента ответа.
 */
export function secondsLeft(room: DuelRoom, receivedAt: number, now: number): number {
  if (!room.deadline) return 0;
  const total = (Date.parse(room.deadline) - Date.parse(room.now)) / 1000;
  if (!Number.isFinite(total)) return 0;
  return Math.max(0, Math.round(total - (now - receivedAt) / 1000));
}

/**
 * Как часто спрашивать комнату.
 *
 * Пока человек пишет, чужие ответы ему не нужны — важно только, что раунд ещё
 * идёт. А в лобби и на разборе каждая секунда ожидания заметна: там ждут
 * чужого действия и смотрят на экран.
 */
export function pollEvery(phase: DuelPhase): number {
  switch (phase) {
    case 'translate':
      return 4000;
    case 'judging':
      return 1500;
    case 'finished':
      return 0;
    default:
      return 2000;
  }
}

export function you(room: DuelRoom): DuelPlayer | undefined {
  return room.players.find((player) => player.id === room.you);
}

/** Кто за столом: ушедшие места не занимают. */
export function seated(room: DuelRoom): DuelPlayer[] {
  return room.players.filter((player) => !player.left);
}

/**
 * Сбор комнаты из подбора кончился, а матч так и не начался.
 *
 * Значит, позвали четверых, а пришёл один. Такому человеку нельзя показывать
 * вечное «стол собирается»: он вправе позвать друга по ссылке, посадить
 * переводчик и начать сам.
 */
export function gatherOver(room: DuelRoom, secondsLeft: number): boolean {
  return room.matched && room.phase === 'lobby' && Boolean(room.deadline) && secondsLeft === 0;
}

/** Матч можно начинать: хозяин, лобби и есть с кем играть. */
export function canStart(room: DuelRoom, secondsLeft = 0): boolean {
  if (!room.host || room.phase !== 'lobby' || seated(room).length < 2) return false;
  // Комната из подбора начинает матч сама, пока идёт сбор: незнакомые люди не
  // станут ждать, пока один из них догадается нажать кнопку.
  return !room.matched || gatherOver(room, secondsLeft);
}

/** Кто ещё пишет. Машины не считаются: они отвечают сразу и целиком. */
export function stillWriting(room: DuelRoom): DuelPlayer[] {
  if (room.phase !== 'translate') return [];
  return seated(room).filter((player) => !player.machine && !player.ready);
}

/** Сколько фраз переведено. */
export function answered(room: DuelRoom): number {
  const answers = room.answers ?? {};
  return (room.sentences ?? []).filter((sentence) => (answers[sentence.id] ?? '').trim()).length;
}

/** Все ли фразы раунда переведены. */
export function everythingAnswered(room: DuelRoom): boolean {
  const total = room.sentences?.length ?? 0;
  return total > 0 && answered(room) === total;
}

/** За сколько фраз голос ещё не отдан. */
export function unvoted(room: DuelRoom): number {
  const votes = room.votes ?? {};
  return (room.ballot ?? []).filter((item) => item.options.length > 0 && !votes[item.sentenceId]).length;
}

export type MatchOutcome = 'won' | 'tie' | 'lost';

/** Чем кончился матч для того, кто смотрит. */
export function outcome(room: DuelRoom): MatchOutcome | null {
  const rows = room.standings ?? [];
  const mine = rows.find((row) => row.id === room.you);
  if (!mine) return null;
  if (mine.place > 1) return 'lost';
  return rows.filter((row) => row.place === 1).length > 1 ? 'tie' : 'won';
}

/** Ссылка-приглашение. Именно её человек кидает в чат. */
export function inviteLink(code: string): string {
  const base = typeof location === 'undefined' ? 'https://citavuk.ru' : location.origin;
  return `${base}/trainer/translation-duel/${code}`;
}

/**
 * Что сказать ждущему подбора.
 *
 * Онлайн у Читавука небольшой, и врать об этом нельзя: когда ожидание
 * затягивается, честнее предложить сыграть с машиной, чем крутить спиннер.
 */
export function searchHint(state: DuelQueueState): string {
  if (state.room) return 'Соперники нашлись — комната ждёт.';
  if (!state.waiting) return '';
  const others = Math.max(0, state.searching - 1);
  if (state.ripe) {
    return others > 0
      ? `Пока не набралось. ${others} ${plural(others, 'человек ищет', 'человека ищут', 'человек ищут')} тот же уровень — поиск продолжается сам.`
      : 'Пока никого. Поиск продолжается сам — можно сыграть с DeepL, а как соперники найдутся, придёт уведомление.';
  }
  return others > 0
    ? `Ищем соперников. Рядом ${others} ${plural(others, 'игрок', 'игрока', 'игроков')}.`
    : 'Ищем соперников.';
}

/** Сколько человек ждёт своей очереди в комнате из подбора. */
export function unconfirmed(room: DuelRoom): number {
  return room.players.filter((player) => !player.left && !player.joined).length;
}

/**
 * Насколько горячо на часах.
 *
 * Отсчёт мелкими цифрами человек не замечает: он смотрит в поле ввода. Поэтому
 * последние полминуты часы меняют цвет, а последние десять секунд ещё и бьются
 * — и то и другое видно боковым зрением, не отрывая глаз от фразы.
 */
export type Urgency = 'calm' | 'warm' | 'hot';

/**
 * Пороги считаются и от длины фазы: в игре с DeepL на фразу даётся 25 секунд, и
 * жёсткие «30 и 10» держали бы такие часы красными почти всё время.
 */
export function urgency(seconds: number, total = 200): Urgency {
  const hot = Math.min(10, total * 0.25);
  const warm = Math.min(30, total * 0.5);
  if (seconds > warm) return 'calm';
  if (seconds > hot) return 'warm';
  return 'hot';
}

/** Сколько фаза длится по замыслу — от этого считается дуга часов. */
export function phaseSeconds(phase: DuelPhase): number {
  switch (phase) {
    case 'translate':
      return 200;
    case 'vote':
      return 90;
    case 'result':
      return 45;
    default:
      return 60;
  }
}

/** Кого ещё ждёт фаза: пишущих в раунде, не проголосовавших на голосовании. */
export function pending(room: DuelRoom): DuelPlayer[] {
  if (room.phase === 'translate') return stillWriting(room);
  if (room.phase === 'vote') {
    return seated(room).filter((player) => !player.machine && !player.voted);
  }
  return [];
}

/**
 * Порядок мест на пьедестале: второе, первое, третье.
 *
 * Первое место стоит в середине и выше остальных — так пьедестал читается с
 * одного взгляда, без разбора цифр.
 */
export function podium(room: DuelRoom): DuelStanding[] {
  const [first, second, third] = (room.standings ?? []).slice(0, 3);
  if (!first) return [];
  if (!second) return [first];
  return third ? [second, first, third] : [second, first];
}

/** Буква для кружка участника: имена за столом длинные, места мало. */
export function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}
