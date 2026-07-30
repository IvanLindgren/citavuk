import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HiSpeakerWave, HiStop } from 'react-icons/hi2';

import { ttsAudioUrl } from '../api/listening';
import { WordReader } from '../components/WordReader';
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

interface DialogueMessage {
  key: string;
  speaker: string;
  text: string;
  nodeId?: string;
}

export function CourseDialogue() {
  const { id = 'drinkit' } = useParams();
  const { account } = useAuth();
  const reduceMotion = useReducedMotion();
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [progress, setProgress] = useState<DialogueProgress | null>(null);
  const [error, setError] = useState('');
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
      stopAudio();
    };
  }, [account, id]);

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

  function stopAudio() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    audioRef.current = null;
    setSpeakingKey(null);
  }

  async function speak(text: string, key: string): Promise<void> {
    stopAudio();
    const audio = new Audio(ttsAudioUrl(text));
    audioRef.current = audio;
    setSpeakingKey(key);
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      void audio.play().catch(() => resolve());
    });
    if (audioRef.current === audio) {
      audioRef.current = null;
      setSpeakingKey(null);
    }
  }

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
    await speak(choice.label, `choice-${choice.id}`);
    await speak(nextNode.text, `node-${nextNode.id}`);
  }

  function restart() {
    if (!bundle || !dialogue) return;
    stopAudio();
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
      className="paper-grain min-h-[calc(100dvh-4rem)] overflow-x-hidden px-3 py-5 sm:px-5 sm:py-8"
      style={{ paddingBottom: hasChoices ? 'min(46dvh, 22rem)' : undefined }}
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
              message={message}
              index={index}
              reducedMotion={Boolean(reduceMotion)}
              speaking={speakingKey === message.key}
              onSpeak={() =>
                speakingKey === message.key
                  ? stopAudio()
                  : void speak(message.text, message.key)
              }
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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--bg)]/95 px-3 pt-3 shadow-[0_-8px_30px_rgba(35,24,13,0.12)] backdrop-blur-md sm:px-5 sm:pt-4">
          <div
            className="mx-auto max-h-[42dvh] max-w-3xl overflow-y-auto"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            <p className="mb-2 text-center text-xs font-bold uppercase text-[var(--text-muted)]">
              Выберите ответ Читавука
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(node.choices ?? []).map((choice, index) => (
                <motion.button
                  key={choice.id}
                  type="button"
                  onClick={() => void choose(choice)}
                  whileTap={{ y: 2 }}
                  className="flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 text-left font-semibold shadow-[0_3px_0_0_var(--line)] transition-colors hover:border-[var(--accent)]"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span>{choice.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DialogueBubble({
  message,
  index,
  reducedMotion,
  speaking,
  onSpeak,
}: {
  message: DialogueMessage;
  index: number;
  reducedMotion: boolean;
  speaking: boolean;
  onSpeak: () => void;
}) {
  const isNarrator = message.speaker === 'Narator';
  const isCitavuk = message.speaker === 'Čitavuk';

  if (isNarrator) {
    return (
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-xl rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-sunken)] px-5 py-4 text-center"
      >
        <div className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase text-[var(--text-muted)]">
          Рассказчик
          <SpeakButton speaking={speaking} onClick={onSpeak} />
        </div>
        <WordReader
          paragraphs={[message.text]}
          paragraphClassName="reader-selectable font-display text-base leading-relaxed sm:text-lg"
        />
      </motion.div>
    );
  }

  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, x: isCitavuk ? 18 : -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.18) }}
      className={[
        'flex items-end gap-2.5 sm:gap-3',
        isCitavuk ? 'flex-row-reverse' : '',
      ].join(' ')}
    >
      <SpeakerAvatar speaker={message.speaker} />
      <div
        className={[
          'relative max-w-[calc(100%-4.25rem)] rounded-2xl border px-4 py-3 shadow-[var(--shadow-soft)] sm:max-w-[82%] sm:px-5 sm:py-4',
          isCitavuk
            ? 'rounded-br-md border-[var(--accent)]/30 bg-[var(--accent)]/9'
            : 'rounded-bl-md border-[var(--line)] bg-[var(--bg-raised)]',
        ].join(' ')}
      >
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-bold uppercase text-[var(--accent)]">
            {message.speaker}
          </span>
          <SpeakButton speaking={speaking} onClick={onSpeak} />
        </div>
        <WordReader
          paragraphs={[message.text]}
          paragraphClassName="reader-selectable font-display text-lg leading-relaxed sm:text-xl"
        />
      </div>
    </motion.article>
  );
}

function SpeakButton({ speaking, onClick }: { speaking: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-full text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/12"
      aria-label={speaking ? 'Остановить озвучку' : 'Озвучить реплику'}
      title={speaking ? 'Остановить' : 'Прослушать'}
    >
      {speaking ? <HiStop aria-hidden="true" /> : <HiSpeakerWave aria-hidden="true" />}
    </button>
  );
}

function SpeakerAvatar({ speaker }: { speaker: string }) {
  const isCitavuk = speaker === 'Čitavuk';
  return (
    <img
      src={isCitavuk ? '/img/citavuk_icon.webp' : '/img/marja-spilberic.png'}
      alt={isCitavuk ? 'Читавук' : 'Марья Спилберич'}
      width={64}
      height={64}
      className="size-12 shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] object-cover sm:size-16"
    />
  );
}

function buildHistory(
  dialogue: Dialogue | null,
  choiceIds: string[],
): DialogueMessage[] {
  if (!dialogue) return [];
  const start = dialogue.nodes.find((item) => item.id === dialogue.startNodeId);
  if (!start) return [];
  let current: DialogueNode = start;
  const messages: DialogueMessage[] = [
    {
      key: `node-${current.id}`,
      speaker: current.speaker,
      text: current.text,
      nodeId: current.id,
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
      nodeId: current.id,
    });
  }
  return messages;
}
