import { describe, expect, it } from 'vitest';

import type { DialogueNode } from '../api/lessons';
import { checkDialogue, nodeLabel, reachableNodes } from './dialogueChecks';

/**
 * Диалог — граф, а редактируется он списком, и в списке не видно ровно того,
 * что важнее всего: куда ведут ответы. Реплику, до которой нельзя дойти, автор
 * замечает не при написании, а когда в неё упирается ученик.
 */

function node(id: string, text: string, choices: Array<[string, string]> = []): DialogueNode {
  return {
    id,
    speaker: 'Ана',
    avatar: 'woman',
    text,
    choices: choices.map(([label, nextId]) => ({ label, nextId })),
  };
}

describe('проверки диалога', () => {
  it('исправный диалог не даёт замечаний', () => {
    const dialogue = {
      startId: 'a',
      nodes: [node('a', 'Здраво!', [['Здраво', 'b']]), node('b', 'Како си?')],
    };
    expect(checkDialogue(dialogue)).toEqual([]);
  });

  it('находит реплику, до которой нельзя дойти', () => {
    const dialogue = {
      startId: 'a',
      nodes: [node('a', 'Здраво!'), node('b', 'Забыта')],
    };
    const issues = checkDialogue(dialogue);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ nodeId: 'b', level: 'warning' });
  });

  // Пустой nextId — законная концовка. Ссылка на удалённую реплику обрывает
  // разговор на середине и выглядит поломкой урока.
  it('различает концовку и ссылку в никуда', () => {
    const ending = { startId: 'a', nodes: [node('a', 'Крај.', [['Готово', '']])] };
    expect(checkDialogue(ending)).toEqual([]);

    const broken = { startId: 'a', nodes: [node('a', 'Здраво!', [['Дальше', 'ghost']])] };
    const issues = checkDialogue(broken);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe('error');
    expect(issues[0]!.message).toContain('удалённую');
  });

  it('замечает пустой текст и пустой вариант', () => {
    const dialogue = { startId: 'a', nodes: [node('a', '   ', [['   ', '']])] };
    const messages = checkDialogue(dialogue).map((issue) => issue.message);
    expect(messages).toContain('Реплика без текста.');
    expect(messages).toContain('Вариант ответа без текста.');
  });

  it('замечает потерянную начальную реплику', () => {
    const dialogue = { startId: 'ghost', nodes: [node('a', 'Здраво!')] };
    expect(checkDialogue(dialogue)[0]!.message).toContain('начинается');
  });

  // «Вернуться к началу» — обычный ход сценария. Зацикленный обход не должен
  // ни зависать, ни считаться ошибкой.
  it('цикл не зацикливает обход и не считается ошибкой', () => {
    const dialogue = {
      startId: 'a',
      nodes: [node('a', 'Здраво!', [['Дальше', 'b']]), node('b', 'Опет?', [['Сначала', 'a']])],
    };
    expect(reachableNodes(dialogue)).toEqual(new Set(['a', 'b']));
    expect(checkDialogue(dialogue)).toEqual([]);
  });

  it('ошибки идут раньше предупреждений', () => {
    const dialogue = {
      startId: 'a',
      nodes: [node('a', '', [['Дальше', 'ghost']]), node('b', 'Забыта')],
    };
    const levels = checkDialogue(dialogue).map((issue) => issue.level);
    expect(levels.indexOf('warning')).toBe(levels.lastIndexOf('error') + 1);
  });

  it('пустой диалог сообщает об этом одним замечанием', () => {
    expect(checkDialogue({ startId: '', nodes: [] })).toHaveLength(1);
  });
});

describe('название реплики', () => {
  // Раньше здесь стоял порядковый номер, и удаление реплики съезжало все
  // ссылки на остальные. Имя от порядка не зависит.
  it('составляется из говорящего и начала фразы', () => {
    expect(nodeLabel(node('a', 'Здраво, како си данас?'), 0)).toBe(
      '1. Ана: Здраво, како си данас?',
    );
  });

  it('длинная фраза укорачивается', () => {
    const label = nodeLabel(node('a', 'реч '.repeat(40)), 4);
    expect(label.startsWith('5. Ана: ')).toBe(true);
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThan(60);
  });

  it('пустая реплика всё равно называется', () => {
    expect(nodeLabel(node('a', '  '), 2)).toBe('3. Ана: (пусто)');
  });
});
