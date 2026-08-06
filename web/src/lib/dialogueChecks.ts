import type { DialogueNode } from '../api/lessons';

/**
 * Проверки сценария диалога.
 *
 * Диалог — граф, а редактируется он списком, и в списке не видно ровно того,
 * что важнее всего: куда ведут ответы. Реплику, до которой нельзя дойти, и
 * ответ, ведущий в никуда, автор замечает не при написании, а когда ученик
 * упирается в них. Поэтому список проверок здесь, рядом с редактором, а не
 * в голове у автора.
 *
 * Проверки вынесены отдельно от вёрстки: у них есть верные и неверные ответы,
 * и это единственная часть редактора, которую можно проверить тестами.
 */

export interface DialogueIssue {
  /** Реплика, к которой относится замечание. Пусто — замечание про весь диалог. */
  nodeId: string;
  /** `error` мешает пройти диалог, `warning` — повод присмотреться. */
  level: 'error' | 'warning';
  message: string;
}

export interface Dialogue {
  startId: string;
  nodes: DialogueNode[];
}

/** Достижимые из начальной реплики узлы. */
export function reachableNodes(dialogue: Dialogue): Set<string> {
  const byId = new Map(dialogue.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const queue = [dialogue.startId];

  while (queue.length > 0) {
    const id = queue.pop()!;
    // Диалоги вправе зацикливаться: «вернуться к началу» — обычный ход
    // сценария, а не ошибка. Поэтому обход помечает посещённые, а не
    // запрещает повторы.
    if (id === '' || seen.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    seen.add(id);
    for (const choice of node.choices ?? []) queue.push(choice.nextId);
  }
  return seen;
}

/** Замечания к сценарию, от важных к второстепенным. */
export function checkDialogue(dialogue: Dialogue): DialogueIssue[] {
  const issues: DialogueIssue[] = [];
  const byId = new Map(dialogue.nodes.map((node) => [node.id, node]));

  if (dialogue.nodes.length === 0) {
    return [{ nodeId: '', level: 'error', message: 'В диалоге нет ни одной реплики.' }];
  }
  if (!byId.has(dialogue.startId)) {
    issues.push({
      nodeId: '',
      level: 'error',
      message: 'Не выбрана реплика, с которой диалог начинается.',
    });
  }

  for (const node of dialogue.nodes) {
    if (node.text.trim() === '') {
      issues.push({ nodeId: node.id, level: 'error', message: 'Реплика без текста.' });
    }
    for (const choice of node.choices ?? []) {
      if (choice.label.trim() === '') {
        issues.push({ nodeId: node.id, level: 'error', message: 'Вариант ответа без текста.' });
      }
      // Пустой nextId — законная концовка, а вот ссылка на несуществующую
      // реплику обрывает диалог посреди разговора и выглядит поломкой.
      if (choice.nextId !== '' && !byId.has(choice.nextId)) {
        issues.push({
          nodeId: node.id,
          level: 'error',
          message: `Ответ «${choice.label.trim() || '…'}» ведёт в удалённую реплику.`,
        });
      }
    }
  }

  const reachable = reachableNodes(dialogue);
  for (const node of dialogue.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        nodeId: node.id,
        level: 'warning',
        message: 'До этой реплики нельзя дойти ни одним ответом.',
      });
    }
  }

  return issues.sort((left, right) => (left.level === right.level ? 0 : left.level === 'error' ? -1 : 1));
}

/**
 * Название реплики для ссылок из вариантов ответа.
 *
 * Раньше здесь стоял порядковый номер, и это была главная ловушка редактора:
 * номера считались по месту в списке, поэтому удаление одной реплики съезжало
 * все ссылки на остальные, а куда что ведёт, автор восстанавливал в уме.
 * Имя составляется из говорящего и начала фразы — оно не зависит от порядка и
 * говорит само за себя.
 */
export function nodeLabel(node: DialogueNode, index: number): string {
  const speaker = node.speaker.trim() || 'Без имени';
  const text = node.text.trim().replace(/\s+/g, ' ');
  if (text === '') return `${index + 1}. ${speaker}: (пусто)`;
  const excerpt = text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text;
  return `${index + 1}. ${speaker}: ${excerpt}`;
}
