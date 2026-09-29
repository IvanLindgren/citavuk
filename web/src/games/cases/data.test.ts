import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  checkAnswer,
  framed,
  normalizeAnswer,
  summarize,
  taskSource,
  type Attempt,
  type CaseGameData,
  type Scope,
} from './data';

// Тесты запускаются из web/, как и соседние, читающие бандл курса.
const data = JSON.parse(readFileSync('public/games/cases.json', 'utf8')) as CaseGameData;

/** Детерминированный генератор, чтобы тесты не зависели от удачи. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe('набор слов', () => {
  it('у каждого существительного есть все падежи обоих чисел', () => {
    expect(data.nouns.length).toBeGreaterThan(300);
    for (const noun of data.nouns) {
      for (const number of ['s', 'p']) {
        for (const key of 'ngdail') {
          expect(noun.f[`${number}${key}` as keyof typeof noun.f]?.length, `${noun.l} ${number}${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('эталон — экавский, иекавский вариант принимается', () => {
    const dete = data.nouns.find((noun) => noun.l === 'dete')!;
    expect(dete.f.pn).toEqual(['deca', 'djeca']);
    const videti = data.verbs.find((verb) => verb.l === 'videti')!;
    expect(videti.pp.sm[0]).toBe('video');
  });

  it('словарные ошибки srLex не попадают в игру', () => {
    expect(data.verbs.find((verb) => verb.l === 'moći')?.im).toBeUndefined();
    expect(data.nouns.find((noun) => noun.l === 'pas')?.f.sv).toBeUndefined();
  });
});

describe('проверка ответа', () => {
  it('засчитывает точный ответ и варианты', () => {
    expect(checkAnswer('kuće', ['kuće']).result).toBe('exact');
    expect(checkAnswer('  Nju ', ['je', 'nju', 'ju']).result).toBe('exact');
    expect(checkAnswer('radila sam', ['sam radila', 'radila sam']).result).toBe('exact');
  });

  it('буква без чёрточки засчитывается с отметкой', () => {
    const verdict = checkAnswer('kuce', ['kuće']);
    expect(verdict.result).toBe('diacritics');
    expect(verdict.missing).toEqual(['ć']);
    expect(checkAnswer('djaka', ['đaka']).result).toBe('diacritics');
    expect(checkAnswer('daka', ['đaka']).result).toBe('diacritics');
  });

  it('лишняя чёрточка — ошибка', () => {
    expect(checkAnswer('kuča', ['kuca']).result).toBe('wrong');
  });

  it('понимает сербскую кириллицу', () => {
    expect(normalizeAnswer('Ђаци!')).toBe('đaci');
    expect(checkAnswer('кући', ['kući']).result).toBe('exact');
  });

  it('неверная форма — ошибка с эталоном', () => {
    const verdict = checkAnswer('kuća', ['kuće']);
    expect(verdict).toEqual({ result: 'wrong', matched: 'kuće', missing: [] });
  });
});

describe('задания', () => {
  const scopes: Scope[] = [
    'all', 'nouns', 'pronouns', 'case:n', 'case:g', 'case:d', 'case:a', 'case:v', 'case:i', 'case:l',
    'verbs', 'tense:pres', 'tense:perf', 'tense:fut', 'tense:imp',
  ];

  it.each(scopes)('набор %s даёт задания с ответами', (scope) => {
    const source = taskSource(data, scope, 'all', seeded(7));
    for (let i = 0; i < 60; i += 1) {
      const task = source.next();
      expect(task.answers.length).toBeGreaterThan(0);
      expect(task.label).not.toBe('');
      if (scope === 'case:v') expect(task.label).toMatch(/^Звательный/);
      if (scope === 'case:n') expect(task.label).toMatch(/мн\. ч\./);
    }
  });

  it('после предлога не бывает кратких форм местоимений', () => {
    const source = taskSource(data, 'pronouns', 'all', seeded(3));
    for (let i = 0; i < 200; i += 1) {
      const task = source.next();
      if (['bez', 'sa', 'o'].includes(task.before)) {
        expect(task.answers).not.toContain('me');
        expect(task.answers).not.toContain('ga');
        expect(task.answers).not.toContain('ih');
      }
    }
  });

  it('перфект принимает оба порядка, футур — с клитикой после подлежащего', () => {
    const perfect = taskSource(data, 'tense:perf', 'a', seeded(11)).next();
    const [first] = perfect.answers;
    const [aux, participle] = first!.split(' ');
    expect(perfect.answers).toContain(`${participle} ${aux}`);
    const future = taskSource(data, 'tense:fut', 'a', seeded(5)).next();
    expect(future.answers[0]).toMatch(/^ć(u|eš|e|emo|ete) /);
  });

  it('уровень A1–A2 не даёт слов старше', () => {
    const levels = new Map(data.nouns.map((noun) => [noun.l, noun.lv]));
    const source = taskSource(data, 'nouns', 'a', seeded(13));
    for (let i = 0; i < 100; i += 1) {
      expect(['A1', 'A2']).toContain(levels.get(source.next().lemma));
    }
  });
});

describe('итоги', () => {
  it('считает точность, скорость и слабые места', () => {
    const task = taskSource(data, 'case:g', 'a', seeded(2)).next();
    const attempts: Attempt[] = [
      { task, typed: task.answers[0]!, verdict: checkAnswer(task.answers[0]!, task.answers), ms: 2000 },
      { task, typed: 'xxx', verdict: checkAnswer('xxx', task.answers), ms: 3000 },
    ];
    const summary = summarize(attempts, 60);
    expect(summary).toMatchObject({ words: 2, correct: 1, wrong: 1, accuracy: 50 });
    expect(summary.weak).toEqual([{ label: task.weakLabel, wrong: 1, total: 2 }]);
    expect(summary.cpm).toBe(normalizeAnswer(task.answers[0]!).length);
  });
});

describe('framed', () => {
  it('ставит ответ на место пропуска, знак препинания — вплотную', () => {
    expect(framed({ before: 'bez', after: '' }, 'kuće')).toBe('bez kuće');
    expect(framed({ before: 'Zdravo,', after: '!' }, 'pesmo')).toBe('Zdravo, pesmo!');
    expect(framed({ before: 'Daj', after: 'knjigu.' }, 'mu')).toBe('Daj mu knjigu.');
    expect(framed({ before: '', after: '' }, 'radim')).toBe('radim');
  });
});
