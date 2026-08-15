import { describe, expect, it } from 'vitest';

import type { DuelPlayer, DuelRoom } from '../api/duel';
import {
  answered,
  canStart,
  everythingAnswered,
  gatherOver,
  initial,
  inviteLink,
  outcome,
  pending,
  podium,
  pollEvery,
  searchHint,
  seated,
  secondsLeft,
  stillWriting,
  unconfirmed,
  unvoted,
  urgency,
} from './room';

function player(id: string, extra: Partial<DuelPlayer> = {}): DuelPlayer {
  return { id, name: id, host: false, joined: true, ready: false, left: false, score: 0, ...extra };
}

function room(extra: Partial<DuelRoom> = {}): DuelRoom {
  return {
    code: 'ABCDEF',
    level: 'A2',
    direction: 'sr-ru',
    seats: 2,
    open: false,
    matched: false,
    phase: 'lobby',
    round: 0,
    rounds: 3,
    you: 'host',
    host: true,
    players: [player('host', { host: true }), player('gost')],
    now: '2026-08-15T12:00:00Z',
    ...extra,
  };
}

describe('часы комнаты', () => {
  it('остаток считается по часам сервера, а не браузера', () => {
    // Часы страницы отстают на две минуты: если считать по ним, раунд
    // «закончится» с большим запасом или не закончится вовсе.
    const state = room({ deadline: '2026-08-15T12:03:20Z', now: '2026-08-15T12:00:00Z' });
    expect(secondsLeft(state, 10_000, 10_000)).toBe(200);
    expect(secondsLeft(state, 10_000, 40_000)).toBe(170);
  });

  it('просроченный дедлайн не уходит в минус', () => {
    const state = room({ deadline: '2026-08-15T12:00:10Z', now: '2026-08-15T12:00:00Z' });
    expect(secondsLeft(state, 0, 60_000)).toBe(0);
  });

  it('без дедлайна ждём человека, а не часы', () => {
    expect(secondsLeft(room(), 0, 1000)).toBe(0);
  });
});

describe('частота опроса', () => {
  it('пока человек пишет, комнату дёргают реже', () => {
    expect(pollEvery('translate')).toBeGreaterThan(pollEvery('lobby'));
    expect(pollEvery('judging')).toBeLessThanOrEqual(pollEvery('lobby'));
  });

  it('доигранную комнату не опрашивают вовсе', () => {
    expect(pollEvery('finished')).toBe(0);
  });
});

describe('состав комнаты', () => {
  it('ушедший места не занимает', () => {
    const state = room({ players: [player('host', { host: true }), player('gost', { left: true })] });
    expect(seated(state)).toHaveLength(1);
    expect(canStart(state)).toBe(false);
  });

  it('матч начинает только хозяин и только вдвоём', () => {
    expect(canStart(room())).toBe(true);
    expect(canStart(room({ host: false }))).toBe(false);
    expect(canStart(room({ phase: 'translate' }))).toBe(false);
  });

  it('ждём только людей: машина отвечает сразу', () => {
    const state = room({
      phase: 'translate',
      players: [
        player('host', { host: true, ready: true }),
        player('gost'),
        player('deepl', { machine: 'deepl' }),
      ],
    });
    expect(stillWriting(state).map((item) => item.id)).toEqual(['gost']);
  });

  it('в комнате из подбора видно, кого ещё ждут', () => {
    const state = room({
      matched: true,
      players: [player('host', { host: true }), player('gost', { joined: false })],
    });
    expect(unconfirmed(state)).toBe(1);
  });
});

describe('ход раунда', () => {
  const sentences = [{ id: 'a2-01', text: 'Prva.' }, { id: 'a2-02', text: 'Druga.' }];

  it('пробелы переводом не считаются', () => {
    const state = room({ sentences, answers: { 'a2-01': 'Первая.', 'a2-02': '   ' } });
    expect(answered(state)).toBe(1);
    expect(everythingAnswered(state)).toBe(false);
  });

  it('раунд готов, когда переведены все фразы', () => {
    const state = room({ sentences, answers: { 'a2-01': 'Первая.', 'a2-02': 'Вторая.' } });
    expect(everythingAnswered(state)).toBe(true);
  });

  it('пустая комната без фраз не считается готовой', () => {
    expect(everythingAnswered(room())).toBe(false);
  });

  it('считаются только фразы, за которые есть за кого голосовать', () => {
    const state = room({
      phase: 'vote',
      ballot: [
        { sentenceId: 'a2-01', text: 'Prva.', options: [{ alias: 'aa', text: 'Первая' }] },
        { sentenceId: 'a2-02', text: 'Druga.', options: [] },
      ],
      votes: {},
    });
    expect(unvoted(state)).toBe(1);
    expect(unvoted({ ...state, votes: { 'a2-01': 'aa' } })).toBe(0);
  });
});

describe('итог матча', () => {
  it('первое место в одиночку — победа', () => {
    const state = room({
      standings: [
        { id: 'host', name: 'Хозяин', score: 7, place: 1 },
        { id: 'gost', name: 'Гость', score: 4, place: 2 },
      ],
    });
    expect(outcome(state)).toBe('won');
  });

  it('разделённое первое место — ничья', () => {
    const state = room({
      standings: [
        { id: 'host', name: 'Хозяин', score: 5, place: 1 },
        { id: 'gost', name: 'Гость', score: 5, place: 1 },
      ],
    });
    expect(outcome(state)).toBe('tie');
  });

  it('не первое место — поражение, а без таблицы итога нет', () => {
    const rows = [
      { id: 'gost', name: 'Гость', score: 9, place: 1 },
      { id: 'host', name: 'Хозяин', score: 1, place: 2 },
    ];
    expect(outcome(room({ standings: rows }))).toBe('lost');
    expect(outcome(room())).toBeNull();
  });
});

describe('приглашение и подбор', () => {
  it('ссылка ведёт прямо в комнату', () => {
    expect(inviteLink('ABCDEF')).toContain('/trainer/translation-duel/ABCDEF');
  });

  it('пока ждём недолго, про DeepL молчим', () => {
    const hint = searchHint({ waiting: true, ripe: false, searching: 1, now: '2026-08-15T12:00:00Z' });
    expect(hint).toBe('Ищем соперников.');
  });

  it('затянувшееся ожидание честно предлагает машину', () => {
    const hint = searchHint({ waiting: true, ripe: true, searching: 1, now: '2026-08-15T12:00:00Z' });
    expect(hint).toContain('DeepL');
    expect(hint).toContain('уведомление');
  });

  it('соседи по очереди считаются без самого ждущего', () => {
    const hint = searchHint({ waiting: true, ripe: false, searching: 3, now: '2026-08-15T12:00:00Z' });
    expect(hint).toContain('2 игрока');
  });

  it('найденная комната отменяет все прочие подсказки', () => {
    const hint = searchHint({
      waiting: true, ripe: true, searching: 4, room: 'ABCDEF', now: '2026-08-15T12:00:00Z',
    });
    expect(hint).toContain('нашлись');
    expect(hint).not.toContain('DeepL');
  });
});

describe('накал матча', () => {
  it('часы греются к концу фазы', () => {
    expect(urgency(90)).toBe('calm');
    expect(urgency(25)).toBe('warm');
    expect(urgency(7)).toBe('hot');
    expect(urgency(0)).toBe('hot');
  });

  it('короткие часы игры с DeepL греются не сразу', () => {
    // 25 секунд на фразу: с прежними порогами такие часы были бы красными почти
    // всё время, и предупреждать им было бы уже нечем.
    expect(urgency(20, 25)).toBe('calm');
    expect(urgency(10, 25)).toBe('warm');
    expect(urgency(4, 25)).toBe('hot');
  });

  it('комната из подбора начинает сама, пока идёт сбор', () => {
    const matched = room({ matched: true, deadline: '2026-08-15T12:01:00Z' });
    expect(canStart(matched, 40)).toBe(false);
    expect(gatherOver(matched, 40)).toBe(false);
  });

  it('но когда сбор кончился, а никто не дошёл, хозяин решает сам', () => {
    const matched = room({ matched: true, deadline: '2026-08-15T12:01:00Z' });
    expect(gatherOver(matched, 0)).toBe(true);
    expect(canStart(matched, 0)).toBe(true);
    // Гостю кнопку всё равно не дают.
    expect(canStart({ ...matched, host: false }, 0)).toBe(false);
  });

  it('на голосовании ждут тех, кто ещё не выбрал', () => {
    const state = room({
      phase: 'vote',
      players: [
        player('host', { host: true, voted: true }),
        player('gost'),
        player('deepl', { machine: 'deepl' }),
      ],
    });
    expect(pending(state).map((item) => item.id)).toEqual(['gost']);
  });

  it('первое место на пьедестале стоит в середине', () => {
    const rows = [
      { id: 'a', name: 'Аня', score: 9, place: 1 },
      { id: 'b', name: 'Борис', score: 5, place: 2 },
      { id: 'c', name: 'Вера', score: 2, place: 3 },
    ];
    expect(podium(room({ standings: rows })).map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('пьедестал на двоих не рассыпается', () => {
    const rows = [
      { id: 'a', name: 'Аня', score: 9, place: 1 },
      { id: 'b', name: 'Борис', score: 5, place: 2 },
    ];
    expect(podium(room({ standings: rows })).map((item) => item.id)).toEqual(['b', 'a']);
    expect(podium(room())).toEqual([]);
  });

  it('буква для кружка берётся из имени', () => {
    expect(initial('  аня')).toBe('А');
    expect(initial('')).toBe('?');
  });
});
