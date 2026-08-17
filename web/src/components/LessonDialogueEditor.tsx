import { useMemo, useState } from 'react';
import { LuCircleAlert, LuMessageCircle, LuPlay, LuPlus, LuTrash2 } from 'react-icons/lu';

import type { DialogueNode, LessonContent } from '../api/lessons';
import { checkDialogue, nodeLabel, reachableNodes } from '../lib/dialogueChecks';
import { Dialogue } from './LessonPlayer';

/**
 * Редактор ветвящегося диалога.
 *
 * Диалог — граф, а редактируется он списком. Само по себе это терпимо: список
 * помещается на телефон, а граф — нет. Невыносимым редактор делали три вещи, и
 * все три исправлены здесь.
 *
 * Ответы ссылались на «Реплику N», где N — место в списке. Удаление одной
 * реплики съезжало все номера, и куда что ведёт, автор восстанавливал в уме.
 * Теперь реплики называются по говорящему и началу фразы — имя не зависит от
 * порядка.
 *
 * Проверить написанное было нечем: диалог можно было увидеть только опубликовав
 * урок. Теперь он проигрывается прямо здесь, тем же самым проигрывателем, что и
 * у ученика, — предпросмотр, который выглядит иначе, хуже, чем никакого.
 *
 * Тупики и недостижимые реплики не были видны вовсе. Теперь они перечислены.
 */
const field =
  'w-full rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2.5 outline-none focus:border-[var(--accent)]';

export function LessonDialogueEditor({
  content,
  onChange,
}: {
  content: LessonContent;
  onChange: (content: LessonContent) => void;
}) {
  const [preview, setPreview] = useState(false);
  const dialogue = content.dialogue;
  const nodes = dialogue?.nodes ?? [];
  const enabled = Boolean(dialogue);

  const issues = useMemo(
    () => (dialogue ? checkDialogue(dialogue) : []),
    [dialogue],
  );
  const reachable = useMemo(
    () => (dialogue ? reachableNodes(dialogue) : new Set<string>()),
    [dialogue],
  );

  const toggle = () => {
    if (enabled) {
      onChange({ ...content, dialogue: undefined });
      setPreview(false);
      return;
    }
    const node: DialogueNode = {
      id: crypto.randomUUID(),
      speaker: 'Преподаватель',
      avatar: 'teacher',
      text: '',
      choices: [],
    };
    onChange({ ...content, dialogue: { startId: node.id, nodes: [node] } });
  };

  const addNode = () => {
    if (!dialogue) return;
    const node: DialogueNode = {
      id: crypto.randomUUID(),
      speaker: 'Преподаватель',
      avatar: 'teacher',
      text: '',
      choices: [],
    };
    onChange({ ...content, dialogue: { ...dialogue, nodes: [...nodes, node] } });
  };

  const updateNode = (index: number, node: DialogueNode) => {
    if (!dialogue) return;
    onChange({
      ...content,
      dialogue: {
        ...dialogue,
        nodes: nodes.map((item, itemIndex) => (itemIndex === index ? node : item)),
      },
    });
  };

  const deleteNode = (id: string) => {
    if (!dialogue || nodes.length <= 1) return;
    // Ссылки на удалённую реплику снимаются сразу. Оставить их значило бы
    // получить диалог, обрывающийся посреди разговора, — и узнать об этом
    // только от ученика.
    const rest = nodes
      .filter((item) => item.id !== id)
      .map((item) => ({
        ...item,
        choices: (item.choices ?? []).map((choice) =>
          choice.nextId === id ? { ...choice, nextId: '' } : choice,
        ),
      }));
    onChange({
      ...content,
      dialogue: {
        startId: dialogue.startId === id ? rest[0]!.id : dialogue.startId,
        nodes: rest,
      },
    });
  };

  return (
    <section className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl">Диалог</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Необязательный ветвящийся сценарий
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Диалог в уроке"
          onClick={toggle}
          className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`}
        >
          <span
            className={`absolute top-1 size-5 rounded-full bg-white transition-transform ${enabled ? 'left-6' : 'left-1'}`}
          />
        </button>
      </div>

      {enabled && dialogue && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPreview((value) => !value)}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 font-semibold hover:border-[var(--accent)]"
            >
              <LuPlay className="size-4" />
              {preview ? 'Скрыть предпросмотр' : 'Пройти диалог'}
            </button>
            <span className="text-sm text-[var(--text-muted)]">
              {nodes.length} реплик · {endingsCount(nodes)} концовок
            </span>
          </div>

          {preview && (
            <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--bg-sunken)] p-4">
              <p className="text-xs font-bold uppercase text-[var(--text-muted)]">
                Так диалог увидит ученик
              </p>
              {/*
                key заставляет проигрыватель начаться заново после правки:
                иначе он остался бы стоять на реплике, которой уже нет.
              */}
              {/* inline: полоса ответов встаёт в поток. Приклеенная к окну,
                  она закрыла бы редактор, в котором преподаватель правит
                  реплики. Всё остальное — как у ученика. */}
              <Dialogue
                key={`${dialogue.startId}:${nodes.length}`}
                nodes={nodes}
                startId={dialogue.startId}
                inline
              />
            </div>
          )}

          {issues.length > 0 && <IssueList issues={issues} nodes={nodes} />}

          <div className="mt-4 space-y-4">
            {nodes.map((node, index) => (
              <DialogueNodeEditor
                key={node.id}
                node={node}
                index={index}
                nodes={nodes}
                isStart={dialogue.startId === node.id}
                unreachable={!reachable.has(node.id)}
                onStart={() =>
                  onChange({ ...content, dialogue: { ...dialogue, startId: node.id } })
                }
                onChange={(value) => updateNode(index, value)}
                onDelete={() => deleteNode(node.id)}
              />
            ))}
            <button
              type="button"
              onClick={addNode}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
            >
              <LuPlus />
              Добавить реплику
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function IssueList({
  issues,
  nodes,
}: {
  issues: ReturnType<typeof checkDialogue>;
  nodes: DialogueNode[];
}) {
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  return (
    <ul className="mt-4 grid gap-1.5 rounded-md border border-[var(--line)] bg-[var(--bg-sunken)] p-4 text-sm">
      {issues.map((issue, position) => (
        <li key={position} className="flex items-start gap-2">
          <LuCircleAlert
            className={`mt-0.5 size-4 shrink-0 ${issue.level === 'error' ? 'text-red-600' : 'text-[var(--text-muted)]'}`}
          />
          <span>
            {issue.nodeId !== '' && (
              <strong className="text-[var(--text-muted)]">
                Реплика {(index.get(issue.nodeId) ?? 0) + 1}:{' '}
              </strong>
            )}
            {issue.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DialogueNodeEditor({
  node,
  index,
  nodes,
  isStart,
  unreachable,
  onStart,
  onChange,
  onDelete,
}: {
  node: DialogueNode;
  index: number;
  nodes: DialogueNode[];
  isStart: boolean;
  unreachable: boolean;
  onStart: () => void;
  onChange: (node: DialogueNode) => void;
  onDelete: () => void;
}) {
  const choices = node.choices ?? [];

  const setChoice = (position: number, patch: Partial<(typeof choices)[number]>) =>
    onChange({
      ...node,
      choices: choices.map((item, itemIndex) =>
        itemIndex === position ? { ...item, ...patch } : item,
      ),
    });

  return (
    <div
      className={`rounded-md border bg-[var(--bg-raised)] ${unreachable ? 'border-dashed border-[var(--text-muted)]' : 'border-[var(--line)]'}`}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <LuMessageCircle className="text-[var(--accent)]" />
        <span className="text-sm font-semibold">Реплика {index + 1}</span>
        {unreachable && !isStart && (
          <span className="rounded bg-[var(--bg-sunken)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            недостижима
          </span>
        )}
        {choices.length === 0 && (
          <span className="rounded bg-[var(--bg-sunken)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            концовка
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <input type="radio" name="dialogue-start" checked={isStart} onChange={onStart} />
          Начало
        </label>
        <button
          type="button"
          title="Удалить реплику"
          aria-label="Удалить реплику"
          disabled={nodes.length <= 1}
          onClick={onDelete}
          className="grid size-8 place-items-center rounded text-[var(--text-muted)] hover:text-red-600 disabled:opacity-30"
        >
          <LuTrash2 />
        </button>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-bold uppercase text-[var(--text-muted)]">
          Говорящий
          <input
            className={`${field} font-normal normal-case text-[var(--text)]`}
            value={node.speaker}
            onChange={(event) => onChange({ ...node, speaker: event.target.value })}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-bold uppercase text-[var(--text-muted)]">
          Персонаж
          <select
            className={`${field} font-normal normal-case text-[var(--text)]`}
            value={node.avatar}
            onChange={(event) =>
              onChange({ ...node, avatar: event.target.value as DialogueNode['avatar'] })
            }
          >
            <option value="teacher">Преподаватель</option>
            <option value="student">Ученик</option>
            <option value="woman">Женщина</option>
            <option value="man">Мужчина</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold sm:col-span-3">
          Текст
          <textarea
            rows={3}
            className={field}
            value={node.text}
            onChange={(event) => onChange({ ...node, text: event.target.value })}
          />
        </label>

        <div className="sm:col-span-3">
          <p className="text-sm font-semibold">Варианты ответа</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Без вариантов реплика заканчивает диалог.
          </p>
          <div className="mt-2 space-y-2">
            {choices.map((choice, choiceIndex) => (
              <div key={choiceIndex} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  aria-label={`Ответ ${choiceIndex + 1}`}
                  className={field}
                  value={choice.label}
                  onChange={(event) => setChoice(choiceIndex, { label: event.target.value })}
                  placeholder="Текст ответа"
                />
                <select
                  aria-label={`Следующая реплика ${choiceIndex + 1}`}
                  className={field}
                  value={choice.nextId}
                  onChange={(event) => setChoice(choiceIndex, { nextId: event.target.value })}
                >
                  <option value="">Завершить диалог</option>
                  {/*
                    Реплики названы по говорящему и началу фразы, а не номером:
                    номер зависит от места в списке и съезжает при удалении.
                  */}
                  {nodes
                    .filter((item) => item.id !== node.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {nodeLabel(item, nodes.indexOf(item))}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  title="Удалить вариант"
                  aria-label="Удалить вариант"
                  onClick={() =>
                    onChange({
                      ...node,
                      choices: choices.filter((_, itemIndex) => itemIndex !== choiceIndex),
                    })
                  }
                  className="grid size-10 place-items-center rounded text-[var(--text-muted)] hover:text-red-600"
                >
                  <LuTrash2 />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...node, choices: [...choices, { label: '', nextId: '' }] })}
            className="mt-2 inline-flex items-center gap-1.5 rounded px-2 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
          >
            <LuPlus />
            Вариант ответа
          </button>
        </div>
      </div>
    </div>
  );
}

function endingsCount(nodes: DialogueNode[]): number {
  return nodes.filter((node) => (node.choices ?? []).length === 0).length;
}
