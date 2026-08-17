import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  CHOICE_BAR_SPACE,
  DialogueBubble,
  DialogueChoiceBar,
  useDialogueSpeech,
  type DialogueFace,
  type DialogueLine,
} from '../components/DialogueStage';
import { Button, Spinner } from '../components/ui';
import {
  loadCourse,
  loadProgress,
  saveDialogueProgress,
  syncCourseProgress,
  uploadCourseProgress,
} from '../course/data';
import type { CourseBundle, DialogueProgress } from '../course/types';
import { Link, useParams } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

interface DialogueChoice {
  id: string;
  label: string;
  next: string;
}

interface DialogueNode {
  id: string;
  speaker: string;
  text: string;
  choices?: DialogueChoice[];
  end?: boolean;
}

interface Dialogue {
  id: string;
  title: string;
  titleSr: string;
  participants: string[];
  startNodeId: string;
  nodes: DialogueNode[];
}



export function CourseDialogue() {
  const { id = 'drinkit' } = useParams();
  const { account } = useAuth();
  const reduceMotion = useReducedMotion();
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [progress, setProgress] = useState<DialogueProgress | null>(null);
  const [error, setError] = useState('');
  const { speakingKey, speak, stop, toggle } = useDialogueSpeech();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useSeo({
    title: 'Дорога к Дринкиту — игровой диалог Читавука',
    description:
      'Игровой диалог на сербском: озвученные реплики, перевод каждого слова и синхронизация прогресса.',
  });

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadCourse(),
      fetch(`/course/dialogues/${encodeURIComponent(id)}.json`).then(
        async (response) => {
          if (!response.ok) throw new Error('Диалог не найден.');
          return (await response.json()) as Dialogue;
        },
      ),
    ])
      .then(async ([course, loaded]) => {
        if (!active) return;
        let courseProgress = loadProgress(course);
        if (account) {
          try {
            courseProgress = await syncCourseProgress(course);
          } catch {
            // Локальная копия остаётся доступной офлайн.
          }
        }
        if (!active) return;
        setBundle(course);
        setDialogue(loaded);
        setProgress(courseProgress.dialogues?.[loaded.id] ?? null);
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : 'Не удалось открыть диалог.',
          );
        }
      });
    return () => {
      active = false;
      stop();
    };
  }, [account, id, stop]);

  const history = useMemo(
    () => buildHistory(dialogue, progress?.choices ?? []),
    [dialogue, progress?.choices],
  );

  const node = useMemo(() => {
    if (!dialogue) return null;
    const currentId = progress?.currentNodeId || dialogue.startNodeId;
    return dialogue.nodes.find((item) => item.id === currentId) ?? null;
  }, [dialogue, progress]);

  useEffect(() => {
    if (history.length <= 1) return;
    const timer = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'nearest',
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [history.length, reduceMotion]);

  async function choose(choice: DialogueChoice) {
    if (!bundle || !dialogue) return;
    const nextNode = dialogue.nodes.find((item) => item.id === choice.next);
    if (!nextNode) return;
    const record: DialogueProgress = {
      dialogueId: dialogue.id,
      status: nextNode.end ? 'completed' : 'inProgress',
      currentNodeId: nextNode.id,
      choices: [...(progress?.choices ?? []), choice.id],
      updatedAt: new Date().toISOString(),
    };
    setProgress(record);
    const courseProgress = saveDialogueProgress(bundle, record);
    if (account) {
      void uploadCourseProgress(bundle, courseProgress).catch(() => {
        // Локальная запись уже сохранена; синхронизация повторится позже.
      });
    }

    // Нажатие пользователя даёт браузеру право запустить звук. Сначала слышна
    // выбранная реплика Читавука, затем ответ собеседницы или рассказчика.
    await speak([
      { key: `choice-${choice.id}`, text: choice.label },
      { key: `node-${nextNode.id}`, text: nextNode.text },
    ]);
  }

  function restart() {
    if (!bundle || !dialogue) return;
    stop();
    const record: DialogueProgress = {
      dialogueId: dialogue.id,
      status: 'inProgress',
      currentNodeId: dialogue.startNodeId,
      choices: [],
      updatedAt: new Date().toISOString(),
    };
    setProgress(record);
    const courseProgress = saveDialogueProgress(bundle, record);
    if (account) void uploadCourseProgress(bundle, courseProgress).catch(() => {});
  }

  if (error) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-3xl">Диалог пока не открылся</h1>
        <p className="mt-3 text-[var(--text-muted)]">{error}</p>
        <Link to="/dialogues" className="mt-6 font-bold text-[var(--accent)]">
          К списку диалогов
        </Link>
      </main>
    );
  }

  if (!dialogue || !node) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const hasChoices = !node.end && (node.choices?.length ?? 0) > 0;

  return (
    <main
      className="paper-grain relative min-h-[calc(100dvh-4rem)] overflow-x-hidden px-3 py-5 sm:px-5 sm:py-8"
      style={{ paddingBottom: hasChoices ? CHOICE_BAR_SPACE : undefined }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/dialogues"
            className="font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            ← Все диалоги
          </Link>
          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 text-sm font-semibold">
              {progress?.status === 'completed'
                ? 'Завершён'
                : progress
                  ? 'В процессе'
                  : 'Не начат'}
            </span>
            {progress && (
              <button
                type="button"
                onClick={restart}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 text-sm font-semibold hover:border-[var(--accent)]"
              >
                Сначала
              </button>
            )}
          </div>
        </div>

        <header className="py-6 text-center">
          <p className="text-xs font-bold uppercase text-[var(--accent)]">
            Игровой диалог · Бета
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl">{dialogue.title}</h1>
          <p className="mt-1 font-display text-lg text-[var(--text-muted)]">
            {dialogue.titleSr}
          </p>
        </header>

        <section className="space-y-5" aria-label="История диалога">
          {history.map((message, index) => (
            <DialogueBubble
              key={message.key}
              line={message}
              index={index}
              reducedMotion={Boolean(reduceMotion)}
              speaking={speakingKey === message.key}
              onSpeak={() => toggle(message)}
            />
          ))}
          <div ref={bottomRef} />
        </section>

        {node.end && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={restart}>Пройти ещё раз</Button>
            <Link
              to="/dialogues"
              className="inline-flex min-h-12 items-center rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-6 font-semibold"
            >
              К списку диалогов
            </Link>
          </div>
        )}

        {!account && (
          <p className="mt-7 rounded-2xl bg-[var(--bg-sunken)] p-4 text-sm leading-relaxed text-[var(--text-muted)]">
            Без аккаунта прогресс хранится только в этом браузере. После входа
            он будет синхронизироваться между устройствами.
          </p>
        )}
      </div>

      {hasChoices && (
        <DialogueChoiceBar
          title="Выберите ответ Читавука"
          choices={(node.choices ?? []).map((choice) => ({
            key: choice.id,
            label: choice.label,
          }))}
          onChoose={(index) => {
            const choice = (node.choices ?? [])[index];
            if (choice) void choose(choice);
          }}
        />
      )}
    </main>
  );
}

/**
 * Лицо говорящего.
 *
 * Во встроенном диалоге состав участников известен заранее: Читавук, Марья и
 * рассказчик. Поля `avatar`, как в уроках преподавателей, тут нет — сценарий
 * лежит в репозитории и меняется вместе с кодом.
 */
function faceOf(speaker: string): DialogueFace {
  if (speaker === 'Čitavuk') return 'citavuk';
  if (speaker === 'Narator') return 'narrator';
  return 'marja';
}

function buildHistory(
  dialogue: Dialogue | null,
  choiceIds: string[],
): DialogueLine[] {
  if (!dialogue) return [];
  const start = dialogue.nodes.find((item) => item.id === dialogue.startNodeId);
  if (!start) return [];
  let current: DialogueNode = start;
  const messages: DialogueLine[] = [
    {
      key: `node-${current.id}`,
      speaker: current.speaker,
      text: current.text,
      face: faceOf(current.speaker),
    },
  ];

  for (const choiceId of choiceIds) {
    const choice: DialogueChoice | undefined = current.choices?.find(
      (item) => item.id === choiceId,
    );
    if (!choice) break;
    messages.push({
      key: `choice-${choice.id}`,
      speaker: 'Čitavuk',
      text: choice.label,
      face: 'citavuk',
      own: true,
    });
    const next: DialogueNode | undefined = dialogue.nodes.find(
      (item) => item.id === choice.next,
    );
    if (!next) break;
    current = next;
    messages.push({
      key: `node-${current.id}`,
      speaker: current.speaker,
      text: current.text,
      face: faceOf(current.speaker),
    });
  }
  return messages;
}
